import type {
  AnswerQuestionRequest,
  AnswerQuestionResponse,
  AttemptRow,
  CheckRowRequest,
  CheckRowResponse,
  OpenAttempt,
  StartAttemptRequest,
  StartAttemptResponse,
  SubmitAttemptRequest,
  SubmitAttemptResponse,
} from '../../api/exercises';
import type { ExerciseDisplay } from '../../api/types';
import * as ec from '../../kernel/error-correction';
import * as mc from '../../kernel/multiple-choice';
import * as matchPairs from '../../kernel/match-pairs';
import * as mp from '../../kernel/minimal-pairs';
import * as sentenceSchema from '../../kernel/sentence-schema';
import * as shortAnswer from '../../kernel/short-answer';
import * as translate from '../../kernel/translate';
import * as wordbank from '../../kernel/wordbank-gapfill';
import {
  ATTEMPT_STATE_REFUSALS,
  closesTable,
  learnerFacingDetails,
  recheckBudget,
  revealedFeedback,
  transcriptOwed,
  withRecordedReveals,
  type AttemptFacts,
} from '../../enginePort/modules/attempts/application/commands/submit-answer/submit-facts';
import {
  questionStatesOf,
  segmentStatesOf,
} from '../../enginePort/modules/attempts/application/services/item-states';
import { audioTranscriptFor } from '../../enginePort/modules/attempts/application/services/audio-transcript';
import { informationTransferLearnerDetails } from '../../enginePort/modules/attempts/application/services/information-transfer-details';
import { seedFrom } from '../../enginePort/shared/application/services/multiple-choice-attempt';
import {
  closedResults,
  currentProbe,
  drawOf,
  HISTORY_SITTINGS,
  historyFor,
  probeStatesOf,
} from '../../enginePort/modules/attempts/application/services/minimal-pairs-attempt';
import * as entity from './attempt';
import { LocalRefusal, OFFLINE_ATTEMPT_PREFIX, type LocalAttempt } from './attempt';
import { feedbackFor, isGradedOffline, validate, type ExerciseKey } from './grading';

/** One call made on a local attempt, kept to be made again on the server (offline plan, B4). */
export type JournalOp =
  | { op: 'submit'; body: SubmitAttemptRequest }
  | { op: 'answer'; body: AnswerQuestionRequest }
  | { op: 'checkRow'; body: CheckRowRequest }
  | { op: 'reveal' }
  | { op: 'selfCheck'; draftAnswer: unknown }
  | { op: 'draft'; draftAnswer: unknown };

export interface LocalEngineDeps {
  now(): Date;
  newId(): string;
  userId(): string | null;
  /** The exercise as the download kept it — `/display`, the student projection. */
  display(exerciseId: string): Promise<ExerciseDisplay | null>;
  /** Its key as the download kept it — `/answers`. */
  key(exerciseId: string): Promise<ExerciseKey | null>;
  /** A clip kept on the phone as a playable `file://` link; null when it is not kept. */
  clipUrl(assetId: string): Promise<string | null>;
  /** The learner's `minimal_pairs` record as the download fetched it, for `weakest`. */
  probeHistory(exerciseId: string): Promise<ProbeHistorySnapshot | null>;
  /** The random source a `minimal_pairs` sitting is dealt from. */
  random(): number;
  attempts: {
    get(id: string): Promise<LocalAttempt | null>;
    put(attempt: LocalAttempt): Promise<void>;
    /** This learner's local attempts at an exercise, newest first. */
    listFor(userId: string, exerciseId: string): Promise<LocalAttempt[]>;
    /** Every local attempt of this learner, newest first. */
    listAll(userId: string): Promise<LocalAttempt[]>;
  };
  /** Records a call that went through, after the attempt it changed is stored. */
  journal(attempt: LocalAttempt, op: JournalOp): Promise<void>;
}

/**
 * `GET /exercises/:id/attempts/probe-history` as the download kept it (offline plan, B6): the
 * learner's scored sittings in the exercise's language, newest first, and when it was asked.
 */
export interface ProbeHistorySnapshot {
  fetchedAt: string;
  targetLanguage: string;
  sittings: Array<{ probes: unknown[] }>;
}

const REVIEW_SUMMARY = 'Your answer has been submitted for review.';
const ENVELOPE = { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' };

function facts(a: LocalAttempt): AttemptFacts {
  return a;
}

function clone(a: LocalAttempt): LocalAttempt {
  return JSON.parse(JSON.stringify(a)) as LocalAttempt;
}

/**
 * exercise-engine's attempt commands, run on the phone (offline plan, B4–B5).
 *
 * Every operation is the engine's command handler with the repository swapped for local
 * storage and the content client for the downloaded key: the same order of steps, the same
 * refusals, the same reply. The grading inside is the engine's own code (`src/enginePort`).
 * A refused operation changes nothing, as the engine's does not save; one that goes through is
 * stored and journalled, so the replay makes it again on the server where it counts.
 */
export class LocalEngine {
  constructor(private readonly deps: LocalEngineDeps) {}

  /** Whether an exercise can be worked here: a template graded offline, its key downloaded. */
  async canStart(exerciseId: string): Promise<boolean> {
    const [display, key] = await Promise.all([
      this.deps.display(exerciseId),
      this.deps.key(exerciseId),
    ]);
    return (
      display !== null &&
      key !== null &&
      isGradedOffline(display.templateCode) &&
      !sittingsLimited(display.templateCode, key)
    );
  }

  /** The learner's open local attempt at an exercise, if any. */
  async openAttemptAt(exerciseId: string): Promise<LocalAttempt | null> {
    const userId = this.deps.userId();
    if (!userId) return null;
    const attempts = await this.deps.attempts.listFor(userId, exerciseId);
    return attempts.find(a => a.status === 'IN_PROGRESS') ?? null;
  }

  async start(exerciseId: string, body: StartAttemptRequest): Promise<StartAttemptResponse> {
    const userId = this.requireUser();
    const display = await this.deps.display(exerciseId);
    const key = await this.deps.key(exerciseId);
    if (
      !display ||
      !key ||
      !isGradedOffline(display.templateCode) ||
      sittingsLimited(display.templateCode, key)
    ) {
      throw new LocalRefusal(422, 'This exercise is not available offline');
    }

    const attempts = await this.deps.attempts.listFor(userId, exerciseId);
    // The engine looks for an open board first — scored by its first check, never in progress
    // between checks — and then for an attempt in progress.
    const newestClosed = attempts.find(a => a.status !== 'IN_PROGRESS');
    const board = newestClosed && isOpenBoard(newestClosed) ? newestClosed : null;
    const existing = board ?? attempts.find(a => a.status === 'IN_PROGRESS') ?? null;

    if (
      existing &&
      (existing.answeredQuestions.length > 0 ||
        existing.checkedRows.length > 0 ||
        existing.pickedOptions.length > 0 ||
        // A `minimal_pairs` sitting is under way from the moment its probes are drawn.
        existing.probeDraw !== null ||
        questionStatesOf(existing).length > 0 ||
        segmentStatesOf(existing).length > 0 ||
        board !== null ||
        existing.id === body.joinAttemptId)
    ) {
      return this.startResponse(existing, display);
    }
    if (existing) {
      throw new LocalRefusal(409, 'Attempt already in progress', null, {
        message: 'Attempt already in progress',
        attemptId: existing.id,
      });
    }

    const attempt = entity.createLocalAttempt({
      id: `${OFFLINE_ATTEMPT_PREFIX}${this.deps.newId()}`,
      userId,
      exerciseId,
      templateCode: display.templateCode,
      targetLanguage: body.language,
      now: this.deps.now(),
    });
    if (display.templateCode === mp.TEMPLATE_CODE) {
      attempt.probeDraw = await this.dealSitting(userId, display, key);
    }
    await this.deps.attempts.put(attempt);
    return this.startResponse(attempt, display);
  }

  /**
   * The engine's `/items` for a sitting on the phone (`hand-out-probe.handler`): the first probe
   * not closed, its clip as the kept file. A clip that is not on the phone is refused like one
   * media-service cannot sign — the student is not handed a probe nobody can hear.
   */
  async handOutProbe(attemptId: string): Promise<unknown> {
    const a = await this.load(attemptId);
    const draw = drawOf(a);
    if (a.templateCode !== mp.TEMPLATE_CODE || draw.length === 0) {
      throw new LocalRefusal(422, 'This attempt has no probes to hand out', 'NOT_A_PROBE_SET');
    }
    if (a.status !== 'IN_PROGRESS') {
      throw new LocalRefusal(422, 'This attempt is no longer in progress', 'NOT_IN_PROGRESS');
    }
    const states = probeStatesOf(a);
    const probe = currentProbe(draw, states);
    if (!probe) {
      throw new LocalRefusal(422, 'Every probe is answered — submit the attempt', 'ALL_PROBES_CLOSED');
    }

    const key = await this.requireKey(a.exerciseId);
    const document = mp.fromPersisted(key.content, key.expectedAnswers);
    const view = mp.toProbeView(document, probe, draw.length);
    const url = view === null ? null : await this.deps.clipUrl(view.clip.assetId);
    if (view === null || url === null) {
      throw new LocalRefusal(503, 'The clip cannot be played right now', 'MEDIA_UNAVAILABLE');
    }

    const state = states.find(s => s.n === probe.n);
    return {
      n: view.n,
      total: view.total,
      questionId: view.questionId,
      clip: {
        url,
        // A kept file does not expire; the field is the engine's, so it is filled.
        expiresAt: new Date(this.deps.now().getTime() + 3_600_000).toISOString(),
        durationMs: view.clip.durationMs,
        provenance: view.clip.provenance,
        dialect: view.clip.dialect,
      },
      options: view.options,
      state: {
        tries: state?.picks.length ?? 0,
        maxTries: mp.maxTries(document.feedback, false),
        closed: false,
      },
      closedProbes: closedResults(draw, states),
    };
  }

  /**
   * The engine's `prepareSitting` with the phone's random source (offline plan, B6). `weakest`
   * reads the record the download fetched together with the sittings played here since — one
   * played before the fetch is either in the record already or, not yet replayed then, left
   * out until the next fetch rather than counted twice. The replay hands the draw over and the
   * server checks it (`checkDraw`) instead of drawing again.
   */
  private async dealSitting(
    userId: string,
    display: ExerciseDisplay,
    key: ExerciseKey,
  ): Promise<mp.DealtProbe[]> {
    const document = mp.fromPersisted(key.content, key.expectedAnswers);
    const history =
      document.set.sampling === 'weakest'
        ? historyFor(document, await this.probeDetails(userId, display))
        : undefined;
    const draw = mp.deal(document, () => this.deps.random(), history);
    if (draw.length === 0) {
      throw new LocalRefusal(422, 'This exercise has no pair with audio to play', 'MP_EMPTY_SET', {
        message: 'This exercise has no pair with audio to play',
        code: 'MP_EMPTY_SET',
      });
    }
    return draw;
  }

  /** What `findScoredDetails` reads on the server, from the record kept and the phone's own. */
  private async probeDetails(userId: string, display: ExerciseDisplay): Promise<unknown[]> {
    const record = await this.deps.probeHistory(display.id);
    const since = record?.fetchedAt ?? '';
    const own: unknown[] = [];
    for (const a of await this.deps.attempts.listAll(userId)) {
      if (a.templateCode !== mp.TEMPLATE_CODE || a.status !== 'SCORED' || a.startedAt <= since) {
        continue;
      }
      const other = a.exerciseId === display.id ? display : await this.deps.display(a.exerciseId);
      if (other?.targetLanguage === display.targetLanguage) own.push(a.validationDetails);
    }
    return [...own, ...(record?.sittings ?? [])].slice(0, HISTORY_SITTINGS);
  }

  async submit(attemptId: string, body: SubmitAttemptRequest): Promise<SubmitAttemptResponse> {
    const stored = await this.load(attemptId);
    const key = await this.requireKey(stored.exerciseId);
    const a = clone(stored);
    const now = this.deps.now();

    a.timeSpentSeconds += Math.max(0, body.timeSpentSeconds ?? 0);

    // A practice attempt already checked is reopened rather than refused.
    if (a.status === 'SCORED') {
      if (closesTable(facts(a))) {
        throw new LocalRefusal(422, 'This table is closed and cannot be checked again');
      }
      entity.reopenForRecheck(a, recheckBudget(a.templateCode, key.content));
    }

    const submittedAnswer = withRecordedReveals(facts(a), body.submittedAnswer, now);
    entity.submit(a, submittedAnswer);

    const result = validate(key, submittedAnswer, a.targetLanguage);
    if (result.isFail) {
      const error = result.error!;
      if (error.code === 'SCHEMA_MISMATCH' || error.code === 'UNSUPPORTED_TEMPLATE') {
        throw new LocalRefusal(400, error.message, error.code);
      }
      if (error.code === 'DICT_TOO_FAST') throw new LocalRefusal(429, error.message, error.code);
      throw new LocalRefusal(
        422,
        error.message,
        ATTEMPT_STATE_REFUSALS.has(error.code) ? null : error.code,
      );
    }
    const outcome = result.value!;

    let reply: SubmitAttemptResponse;
    if (outcome.requiresReview) {
      entity.routeForReview(a, outcome.details);
      reply = {
        attemptId: a.id,
        correct: false,
        score: null,
        requiresReview: true,
        feedback: { summary: REVIEW_SUMMARY },
        audioTranscript: audioTranscriptFor(key.content, true),
        details: learnerFacingDetails(a.templateCode, outcome.details),
      };
    } else {
      const feedback =
        revealedFeedback(a.templateCode, outcome.details) ??
        (await feedbackFor(key, outcome, a.targetLanguage, body.locale ?? 'en'));

      if (outcome.inProgress === true) {
        entity.recordPartialCheck(a, outcome.details);
        reply = {
          attemptId: a.id,
          correct: outcome.correct,
          score: outcome.score,
          requiresReview: false,
          feedback,
          details: learnerFacingDetails(a.templateCode, outcome.details),
        };
      } else {
        entity.score(a, outcome.details);
        reply = {
          attemptId: a.id,
          correct: outcome.correct,
          score: outcome.score,
          requiresReview: false,
          feedback,
          details: await this.withPairClips(
            a.templateCode,
            learnerFacingDetails(a.templateCode, outcome.details),
            key,
          ),
          audioTranscript: audioTranscriptFor(
            key.content,
            transcriptOwed(a.templateCode, outcome.details),
          ),
        };
      }
    }

    await this.commit(a, { op: 'submit', body });
    return stripUndefined(reply);
  }

  async answerQuestion(
    attemptId: string,
    body: AnswerQuestionRequest,
  ): Promise<AnswerQuestionResponse> {
    const stored = await this.load(attemptId);
    const a = clone(stored);
    const now = this.deps.now();
    const reveal = body.reveal === true;

    if (a.templateCode === shortAnswer.TEMPLATE_CODE) {
      if (typeof body.text !== 'string') {
        throw new LocalRefusal(422, 'This exercise is not answered a question at a time');
      }
      if (body.text.trim() === '') {
        throw new LocalRefusal(400, 'An answer cannot be handed in empty');
      }
    } else if (a.templateCode === mc.TEMPLATE_CODE) {
      if (body.optionId === undefined && !reveal) {
        throw new LocalRefusal(422, 'This exercise is not answered a question at a time');
      }
      if (!reveal && (body.optionId === null || body.optionId === '')) {
        throw new LocalRefusal(400, 'An answer cannot be handed in empty');
      }
      const state = a.pickedOptions.find(q => q.questionId === body.questionId);
      if (state?.closed === true) {
        throw new LocalRefusal(
          422,
          'This question is finished — it was answered, revealed, or all its attempts are spent',
        );
      }
    } else if (a.templateCode === mp.TEMPLATE_CODE) {
      // A pick and nothing else: there is no «show me» on a probe.
      if (body.optionId === undefined || reveal) {
        throw new LocalRefusal(422, 'This exercise is not answered a question at a time');
      }
      if (body.optionId === null || body.optionId === '') {
        throw new LocalRefusal(400, 'An answer cannot be handed in empty');
      }
    } else {
      throw new LocalRefusal(422, 'This exercise is not answered a question at a time');
    }

    const key = await this.requireKey(a.exerciseId);
    const reply =
      a.templateCode === shortAnswer.TEMPLATE_CODE
        ? this.answerShortAnswer(a, key, body.questionId, body.text as string, now)
        : a.templateCode === mp.TEMPLATE_CODE
          ? await this.answerProbe(a, key, body.questionId, body.optionId as string, now)
          : this.pickOption(a, key, body.questionId, body.optionId ?? null, reveal, now);

    await this.commit(a, { op: 'answer', body });
    return stripUndefined(reply);
  }

  async checkRow(attemptId: string, body: CheckRowRequest): Promise<CheckRowResponse> {
    const stored = await this.load(attemptId);
    const a = clone(stored);
    const reveal = body.reveal === true;
    if (a.templateCode !== sentenceSchema.TEMPLATE_CODE) {
      throw new LocalRefusal(422, 'This exercise is not worked through a sentence at a time');
    }
    if (!reveal && Object.values(body.placement).every(items => items.length === 0)) {
      throw new LocalRefusal(400, 'There is nothing on the board to check');
    }

    const key = await this.requireKey(a.exerciseId);
    if (!sentenceSchema.isSentenceSchemaDocument(key.content)) {
      throw new LocalRefusal(422, 'This exercise is not worked through a sentence at a time');
    }
    const document = sentenceSchema.fromPersisted(key.content, key.expectedAnswers);
    const rows = sentenceSchema.deliverableRows(document);
    const row = rows.find(r => r.id === body.rowId);
    if (!row) throw new LocalRefusal(400, 'This exercise has no such sentence to solve');

    const fields = sentenceSchema.fieldsFor(document, row);
    const previous = a.checkedRows.find(r => r.rowId === body.rowId);
    const attemptNo = (previous?.attempts ?? 0) + (reveal ? 0 : 1);

    const { placement, result } = reveal
      ? sentenceSchema.revealRow(row, fields, document.settings, attemptNo)
      : {
          placement: body.placement,
          result: sentenceSchema.toStudentResult({
            row,
            fields,
            marks: sentenceSchema.grade(row, fields, body.placement, document.settings),
            settings: document.settings,
            attempt: attemptNo,
            revealed: false,
          }),
        };

    entity.checkRow(
      a,
      { rowId: body.rowId, placement, solved: result.solved, revealed: reveal },
      this.deps.now(),
    );

    const closed = a.checkedRows.filter(r => r.solved || r.revealed).length;
    await this.commit(a, { op: 'checkRow', body });
    return stripUndefined({
      attemptId: a.id,
      closed,
      total: rows.length,
      result,
      audioTranscript: audioTranscriptFor(key.content, closed >= rows.length),
    });
  }

  async revealAnswers(attemptId: string): Promise<unknown> {
    const stored = await this.load(attemptId);
    const a = clone(stored);
    if (a.templateCode !== wordbank.TEMPLATE_CODE && a.templateCode !== matchPairs.TEMPLATE_CODE) {
      throw new LocalRefusal(422, 'This exercise type does not withhold its answers');
    }
    try {
      entity.revealAnswers(a);
    } catch {
      // The engine's controller answers every domain refusal of a reveal with one sentence.
      throw new LocalRefusal(422, 'Cannot reveal answers for this attempt');
    }
    const key = await this.requireKey(a.exerciseId);
    const envelope = { ...ENVELOPE, id: a.exerciseId };

    let reply: unknown;
    if (a.templateCode === matchPairs.TEMPLATE_CODE) {
      const document = matchPairs.fromPersisted(envelope, key.content, key.expectedAnswers);
      reply = {
        attemptId: a.id,
        templateCode: matchPairs.TEMPLATE_CODE,
        answers: matchPairs.completePairs(document).map(pair => {
          const why = matchPairs.feedbackFor(document, pair.id).why.trim();
          return { pairId: pair.id, rightId: pair.rightId, text: pair.right, why: why === '' ? null : why };
        }),
        attemptClosed: true,
      };
    } else {
      const document = wordbank.fromPersisted(envelope, key.content, key.expectedAnswers);
      reply = {
        attemptId: a.id,
        templateCode: wordbank.TEMPLATE_CODE,
        answers: wordbank.gaps(document).map(gap => {
          const why = wordbank.feedbackFor(document, gap.key).why.trim();
          return { gapKey: gap.key, label: gap.label, word: gap.answer, why: why === '' ? null : why };
        }),
        attemptClosed: true,
      };
    }

    await this.commit(a, { op: 'reveal' });
    return reply;
  }

  async selfCheck(attemptId: string, draftAnswer: unknown): Promise<unknown> {
    const stored = await this.load(attemptId);
    const a = clone(stored);
    const isTranslate = translate.isTranslateCode(a.templateCode);
    if (a.templateCode !== ec.TEMPLATE_CODE && !isTranslate) {
      throw new LocalRefusal(422, 'This exercise type has no self-check');
    }
    const draft = isTranslate ? readTranslateDraft(draftAnswer) : readEcDraft(draftAnswer);
    if (draft === null) {
      throw new LocalRefusal(
        400,
        "Draft answer must carry the work so far in this template's shape",
      );
    }

    const key = await this.requireKey(a.exerciseId);
    const envelope = { ...ENVELOPE, id: a.exerciseId };
    let budget: number;
    let payload: Record<string, unknown>;
    if (isTranslate) {
      const code = a.templateCode as translate.TranslateType;
      const document = translate.fromPersisted(envelope, code, key.content, key.expectedAnswers);
      const items = translate.runItems(document);
      const feedback = translate.selfCheckFeedback(
        { items, check: document.check, flow: document.flow },
        draft as Record<string, string>,
      );
      budget = document.check.on ? document.flow.selfCheck : 0;
      payload = { templateCode: code, items: feedback.items, passing: feedback.passing };
    } else {
      const document = ec.fromPersisted(envelope, key.content, key.expectedAnswers);
      const items = document.items.filter(item => item.wrong.trim() !== '');
      const feedback = ec.selfCheckFeedback(
        { items, check: document.check, hints: document.hints },
        draft as Record<string, ec.StudentEdits>,
      );
      budget = document.check.on ? document.flow.selfCheck : 0;
      payload = {
        templateCode: ec.TEMPLATE_CODE,
        items: feedback.items,
        fixedCount: feedback.fixedCount,
        spanCount: feedback.spanCount,
      };
    }

    entity.useSelfCheck(a, budget);
    await this.commit(a, { op: 'selfCheck', draftAnswer });
    return {
      attemptId: a.id,
      checksUsed: a.selfChecksUsed,
      checksLeft: Math.max(0, budget - a.selfChecksUsed),
      ...payload,
    };
  }

  async saveDraft(attemptId: string, draftAnswer: unknown): Promise<{ savedAt: string }> {
    const a = clone(await this.load(attemptId));
    entity.saveDraft(a, draftAnswer);
    await this.commit(a, { op: 'draft', draftAnswer });
    return { savedAt: this.deps.now().toISOString() };
  }

  /** The open attempt at an exercise as `GET /attempts?status=IN_PROGRESS` reads it. */
  async findOpenAttempt(exerciseId: string): Promise<OpenAttempt | null> {
    const open = await this.openAttemptAt(exerciseId);
    if (!open) return null;
    return {
      attemptId: open.id,
      answeredQuestions: open.answeredQuestions.map(({ questionId, text, verdict }) => ({
        questionId,
        text,
        verdict,
      })),
      checkedRows: open.checkedRows.map(({ rowId, attempts, placement, solved, revealed }) => ({
        rowId,
        attempts,
        placement,
        solved,
        revealed,
      })),
      pickedOptions: open.pickedOptions.map(
        ({ questionId, picks, eliminated, correct, closed, revealed }) => ({
          questionId,
          picks,
          eliminated,
          correct,
          closed,
          revealed,
        }),
      ),
      questionStates: questionStatesOf(open),
      segmentStates: segmentStatesOf(open),
    };
  }

  /** The last check of a board left open, as `findOpenBoardCheck` reads it from the server. */
  async findOpenBoardCheck(exerciseId: string): Promise<unknown> {
    const userId = this.deps.userId();
    if (!userId) return null;
    const newest = (await this.deps.attempts.listFor(userId, exerciseId)).find(
      a => a.status !== 'IN_PROGRESS',
    );
    if (!newest || !isOpenBoard(newest)) return null;
    return newest.validationDetails;
  }

  async getAttempt(attemptId: string): Promise<AttemptRow> {
    return toRow(await this.load(attemptId));
  }

  async recentAttempts(exerciseId: string, limit: number): Promise<AttemptRow[]> {
    const userId = this.deps.userId();
    if (!userId) return [];
    return (await this.deps.attempts.listFor(userId, exerciseId)).slice(0, limit).map(toRow);
  }

  private answerShortAnswer(
    a: LocalAttempt,
    key: ExerciseKey,
    questionId: string,
    text: string,
    now: Date,
  ): AnswerQuestionResponse {
    if (!shortAnswer.isShortAnswerDocument(key.content)) {
      throw new LocalRefusal(422, 'This exercise is not answered a question at a time');
    }
    const document = shortAnswer.fromPersisted(key.content, key.expectedAnswers);
    const question = document.questions.find(q => q.id === questionId);
    if (!question || shortAnswer.usableElements(question).length === 0) {
      throw new LocalRefusal(400, 'This exercise has no such answerable question');
    }
    const result = shortAnswer.grade(question, text, document.settings);
    entity.answerQuestion(a, { questionId, text, verdict: result.verdict }, now);

    const settings = document.settings;
    const total = document.questions.filter(q => shortAnswer.usableElements(q).length > 0).length;
    return {
      attemptId: a.id,
      templateCode: shortAnswer.TEMPLATE_CODE,
      answered: a.answeredQuestions.length,
      total,
      result: shortAnswer.toStudentResult(
        {
          questionId,
          verdict: result.verdict,
          covered: result.covered,
          total: result.total,
          tooShort: result.tooShort,
          hits: result.hits,
          why: question.why,
          model: question.model,
        },
        {
          passRule: settings.passRule,
          passN: settings.passN,
          minWords: settings.minWords,
          showBreakdown: settings.showBreakdown,
          showModel: settings.showModel,
          aiStage: settings.aiStage,
          aiGrammar: settings.aiGrammar,
          teacherReview: settings.teacherReview,
          progress: settings.progress,
        },
      ),
      routedForReview:
        settings.teacherReview === 'all' ||
        (settings.teacherReview === 'flagged' && result.verdict !== 'pass'),
      audioTranscript: audioTranscriptFor(key.content, a.answeredQuestions.length >= total),
    };
  }

  /**
   * The engine's `answerProbe`: one answer judged by the kernel against the draw, the key and
   * the A/B pair only once the probe closes, the pair as the kept files.
   */
  private async answerProbe(
    a: LocalAttempt,
    key: ExerciseKey,
    questionId: string,
    optionId: string,
    now: Date,
  ): Promise<AnswerQuestionResponse> {
    if (a.status !== 'IN_PROGRESS') {
      throw new LocalRefusal(422, `Cannot answer a question on an attempt with status ${a.status}`);
    }
    const draw = drawOf(a);
    const n = mp.probeNumber(questionId);
    const probe = n === null ? undefined : draw.find(p => p.n === n);
    if (!probe) throw new LocalRefusal(400, 'This exercise has no such answerable question');
    const states = probeStatesOf(a);
    if (states.some(s => s.n === probe.n && s.closed)) {
      throw new LocalRefusal(
        422,
        'This question is finished — it was answered, revealed, or all its attempts are spent',
      );
    }
    if (currentProbe(draw, states)?.n !== probe.n) {
      throw new LocalRefusal(422, 'This is not the probe the sitting is on — ask POST /items for it');
    }

    const document = mp.fromPersisted(key.content, key.expectedAnswers);
    const state = states.find(s => s.n === probe.n);
    const tries = mp.maxTries(document.feedback, false);
    const judged = mp.judgePick(probe, state, optionId, tries);
    if ('refused' in judged) {
      throw judged.refused === 'closed'
        ? new LocalRefusal(
            422,
            'This question is finished — it was answered, revealed, or all its attempts are spent',
          )
        : new LocalRefusal(400, 'That is not one of this probe’s options');
    }
    const { verdict, next } = judged;
    entity.pickOption(
      a,
      { questionId, optionId, correct: verdict.correct, closed: verdict.closed, revealed: false },
      now,
    );

    const result: Record<string, unknown> = {
      questionId,
      n: probe.n,
      optionId,
      correct: verdict.correct,
      closed: verdict.closed,
      tries: next.picks.length,
      triesLeft: Math.max(0, tries - next.picks.length),
      firstCorrect: next.picks[0] === probe.wordId,
    };
    if (verdict.closed) {
      const reveal = mp.revealOf(document, probe, optionId);
      result.keyOptionId = reveal.keyOptionId;
      result.options = reveal.options;
      if (reveal.compare) {
        const chosen = await this.deps.clipUrl(reveal.compare.chosenAssetId);
        const target = await this.deps.clipUrl(reveal.compare.targetAssetId);
        // Both or neither: half a comparison is not one.
        if (chosen && target) result.compare = { chosen, target };
      }
    }

    return {
      attemptId: a.id,
      templateCode: mp.TEMPLATE_CODE,
      answered: probeStatesOf(a).filter(s => s.closed).length,
      total: draw.length,
      result,
      routedForReview: false,
    } as AnswerQuestionResponse;
  }

  private pickOption(
    a: LocalAttempt,
    key: ExerciseKey,
    questionId: string,
    optionId: string | null,
    reveal: boolean,
    now: Date,
  ): AnswerQuestionResponse {
    if (!mc.isMultipleChoiceDocument(key.content)) {
      throw new LocalRefusal(422, 'This exercise is not answered a question at a time');
    }
    const document = mc.fromPersisted(key.content, key.expectedAnswers);
    const answerable = mc.answerableQuestions(document);
    const question = answerable.find(q => q.id === questionId);
    if (!question) throw new LocalRefusal(400, 'This exercise has no such answerable question');

    const state = a.pickedOptions.find(q => q.questionId === questionId);
    const attemptNo = (state?.picks.length ?? 0) + (reveal ? 0 : 1);
    const picked = reveal ? (state?.picks[state.picks.length - 1] ?? '') : (optionId ?? '');

    const verdict = mc.judge({
      question,
      settings: document.settings,
      optionId: picked,
      attempt: Math.max(1, attemptNo),
      reveal,
      eliminated: state?.eliminated ?? [],
      // The engine seeds the 50/50 by its attempt id; the replay deals it again there.
      seed: seedFrom(a.id, questionId, String(attemptNo)),
    });

    entity.pickOption(
      a,
      {
        questionId,
        optionId: reveal ? null : optionId,
        correct: verdict.correct,
        closed: verdict.closed,
        revealed: reveal,
        eliminated: verdict.eliminated,
      },
      now,
    );

    const closed = a.pickedOptions.filter(q => q.closed).length;
    return {
      attemptId: a.id,
      templateCode: mc.TEMPLATE_CODE,
      answered: closed,
      total: answerable.length,
      result: verdict,
      routedForReview: false,
      audioTranscript: audioTranscriptFor(key.content, closed >= answerable.length),
    };
  }

  /**
   * The engine's `withPairClips`: «Hør paret» under each pair of a `minimal_pairs` result, a
   * kept file per word in the pair's order, an empty string where the file is not kept.
   */
  private async withPairClips(
    templateCode: string,
    details: unknown,
    key: ExerciseKey,
  ): Promise<unknown> {
    if (templateCode !== mp.TEMPLATE_CODE || typeof details !== 'object' || details === null) {
      return details;
    }
    const summary = details as { pairs?: Array<{ pairId: string }> };
    if (!Array.isArray(summary.pairs)) return details;
    const document = mp.fromPersisted(key.content, key.expectedAnswers);
    const assetsOf = new Map(
      document.pairs.map(p => [p.id, mp.filledWords(p).map(w => w.clip.assetId)]),
    );
    const pairs = [];
    for (const p of summary.pairs) {
      const clips = [];
      for (const id of assetsOf.get(p.pairId) ?? []) clips.push((await this.deps.clipUrl(id)) ?? '');
      pairs.push({ ...p, clips });
    }
    return { ...summary, pairs };
  }

  private startResponse(a: LocalAttempt, display: ExerciseDisplay): StartAttemptResponse {
    return {
      attemptId: a.id,
      templateCode: display.templateCode,
      targetLanguage: a.targetLanguage,
      difficultyLevel: display.difficultyLevel ?? 'A1',
      checkMode: 'PRACTICE',
      // The download's student projection: the same masking as the engine's, its own shuffle.
      exerciseContent: display.content,
      expectedAnswers: null,
      answerSchema: null,
      checkSettings: {},
    };
  }

  private async commit(a: LocalAttempt, op: JournalOp): Promise<void> {
    await this.deps.attempts.put(a);
    await this.deps.journal(a, op);
  }

  private async load(attemptId: string): Promise<LocalAttempt> {
    const a = await this.deps.attempts.get(attemptId);
    if (!a) throw new LocalRefusal(404, 'Attempt not found');
    if (a.userId !== this.deps.userId()) throw new LocalRefusal(404, 'Attempt not found');
    return a;
  }

  private async requireKey(exerciseId: string): Promise<ExerciseKey> {
    const key = await this.deps.key(exerciseId);
    if (!key) throw new LocalRefusal(422, 'This exercise is not available offline');
    return key;
  }

  private requireUser(): string {
    const userId = this.deps.userId();
    if (!userId) throw new LocalRefusal(404, 'Not signed in');
    return userId;
  }
}

/** The engine's `isOpenBoard`: a board scored by its last check and left open. */
function isOpenBoard(a: LocalAttempt): boolean {
  if (a.status !== 'SCORED') return false;
  if (a.templateCode !== 'inflection_table' && a.templateCode !== 'information_transfer') {
    return false;
  }
  return (a.validationDetails as { closed?: unknown } | null)?.closed === false;
}

function toRow(a: LocalAttempt): AttemptRow {
  return {
    id: a.id,
    status: a.status,
    templateCode: a.templateCode,
    submittedAnswer: a.submittedAnswer,
    draftAnswer: a.draftAnswer,
    validationDetails:
      a.templateCode === 'information_transfer'
        ? informationTransferLearnerDetails(a.validationDetails)
        : a.validationDetails,
  } as AttemptRow;
}

function readEcDraft(draft: unknown): Record<string, ec.StudentEdits> | null {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return null;
  const { items } = draft as { items?: unknown };
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;
  const out: Record<string, ec.StudentEdits> = {};
  for (const [itemId, raw] of Object.entries(items)) out[itemId] = ec.readEdits(raw);
  return out;
}

function readTranslateDraft(draft: unknown): Record<string, string> | null {
  const list = Array.isArray(draft)
    ? draft
    : typeof draft === 'object' && draft !== null
      ? (draft as { answers?: unknown }).answers
      : undefined;
  if (!Array.isArray(list)) return null;
  return translate.readSubmission(list);
}

/** A reply as JSON would carry it: the engine's `undefined` fields never reach the phone. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * `minimal_pairs` with a limit on sittings stays online (offline plan, B6): the phone cannot
 * know how many the server has already counted, and a replay over the limit is refused — the
 * whole sitting lost after the student was told it was done.
 */
function sittingsLimited(templateCode: string, key: ExerciseKey): boolean {
  if (templateCode !== mp.TEMPLATE_CODE) return false;
  return mp.fromPersisted(key.content, key.expectedAnswers).scoring.attempts > 0;
}
