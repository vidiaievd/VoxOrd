import {
  deal,
  lcg,
  sampleDocument,
  setScoring,
  setSet,
  toContent,
  toExpectedAnswers,
  toStudentProjection,
  type DealtProbe,
  type MinimalPairsContent,
} from '../../kernel/minimal-pairs';
import { LocalRefusal } from './attempt';
import type { ProbeHistorySnapshot } from './engine';
import type { ExerciseKey } from './grading';
import { exerciseFrom, memoryEngine } from './testing';

/**
 * A `minimal_pairs` sitting on the phone (offline plan, B6) beyond what the stand recordings
 * hold: which sets stay online, a clip that is not kept, and the record `weakest` deals from.
 */
function exercise(doc: MinimalPairsContent, id = 'ex') {
  const key: ExerciseKey = {
    templateCode: 'minimal_pairs',
    content: toContent(doc),
    expectedAnswers: toExpectedAnswers(doc),
    answerCheckSettings: null,
    instructions: null,
  };
  return exerciseFrom(id, key, toStudentProjection(toContent(doc)) as unknown as Record<string, unknown>);
}

const drawOf = (engine: ReturnType<typeof memoryEngine>, id: string) =>
  engine.attempts.get(id)?.probeDraw as DealtProbe[];

describe('a minimal_pairs sitting on the phone', () => {
  it('stays online when the author limits the sittings', async () => {
    const h = memoryEngine({ ex: exercise(setScoring(sampleDocument(), { attempts: 2 })) });
    expect(await h.engine.canStart('ex')).toBe(false);
    await expect(h.engine.start('ex', { language: 'nb' })).rejects.toMatchObject({ status: 422 });
    expect(await memoryEngine({ ex: exercise(sampleDocument()) }).engine.canStart('ex')).toBe(true);
  });

  it('keeps its draw across a restart instead of dealing again', async () => {
    const h = memoryEngine({ ex: exercise(sampleDocument()) });
    const first = await h.engine.start('ex', { language: 'nb' });
    const again = await h.engine.start('ex', { language: 'nb' });
    expect(again.attemptId).toBe(first.attemptId);
    expect(drawOf(h, first.attemptId)).toEqual(deal(sampleDocument(), lcg(7)));
    // The projection, as from the server: no pair, no word, no clip.
    expect(JSON.stringify(first.exerciseContent)).not.toContain('kjære');
  });

  it('refuses a probe whose clip is not kept, as media-service being away is refused', async () => {
    const h = memoryEngine({ ex: exercise(sampleDocument()) }, 'user-1', { clipUrl: () => null });
    const { attemptId } = await h.engine.start('ex', { language: 'nb' });
    const refused = await h.engine.handOutProbe(attemptId).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(LocalRefusal);
    expect(refused).toMatchObject({ status: 503, code: 'MEDIA_UNAVAILABLE' });
  });

  it('hands the kept file out as the clip, and the draw to the journal', async () => {
    const h = memoryEngine({ ex: exercise(sampleDocument()) });
    const { attemptId } = await h.engine.start('ex', { language: 'nb' });
    const probe = (await h.engine.handOutProbe(attemptId)) as { clip: { url: string } };
    expect(probe.clip.url).toMatch(/^file:\/\/\/media\//);

    const first = drawOf(h, attemptId)[0]!;
    await h.engine.answerQuestion(attemptId, { questionId: 'p1', optionId: first.wordId });
    expect(h.journal).toHaveLength(1);
    expect(h.attempts.get(attemptId)?.probeDraw).toEqual(drawOf(h, attemptId));
  });

  describe('weakest', () => {
    const weakest = setSet(sampleDocument(), { sampling: 'weakest' });
    const missed = (doc: MinimalPairsContent, text: string) => {
      const word = doc.pairs.flatMap(p => p.words.map(w => ({ ...w, pairId: p.id }))).find(w => w.text === text)!;
      return {
        n: 1,
        pairId: word.pairId,
        wordId: word.id,
        text,
        contrastId: doc.contrastId,
        first: 'other',
        final: 'other',
        tries: 1,
        correct: false,
        provenance: 'studio',
      };
    };
    const record = (fetchedAt: string, probes: unknown[]): ProbeHistorySnapshot => ({
      fetchedAt,
      targetLanguage: 'nb',
      sittings: [{ probes }],
    });
    const countOf = (draw: DealtProbe[], doc: MinimalPairsContent, text: string) =>
      draw.filter(p => doc.pairs.flatMap(x => x.words).find(w => w.id === p.wordId)?.text === text).length;

    it('deals as the server would from the record the download kept', async () => {
      const history = { ex: record('2026-10-15T00:00:00.000Z', [missed(weakest, 'kjære')]) };
      const h = memoryEngine({ ex: exercise(weakest) }, 'user-1', { probeHistory: history, seed: 3 });
      const { attemptId } = await h.engine.start('ex', { language: 'nb' });
      const expected = deal(weakest, lcg(3), { kjære: { played: 1, missed: 1 } });
      expect(drawOf(h, attemptId)).toEqual(expected);
      expect(drawOf(h, attemptId)).not.toEqual(deal(weakest, lcg(3)));
    });

    it('adds the sittings played here since the record was fetched, and only those', async () => {
      const other = exercise(weakest, 'other');
      const run = async (fetchedAt: string) => {
        const h = memoryEngine({ ex: exercise(weakest), other }, 'user-1', {
          probeHistory: { ex: record(fetchedAt, []) },
          seed: 3,
        });
        // A sitting of another set in the language, every probe missed, handed in on the phone.
        const { attemptId } = await h.engine.start('other', { language: 'nb' });
        for (const p of drawOf(h, attemptId)) {
          await h.engine.answerQuestion(attemptId, {
            questionId: `p${p.n}`,
            optionId: p.optionIds.find(id => id !== p.wordId)!,
          });
        }
        await h.engine.submit(attemptId, { submittedAnswer: {}, timeSpentSeconds: 10 });
        const next = await h.engine.start('ex', { language: 'nb' });
        return drawOf(h, next.attemptId);
      };
      // Fetched before the sitting: it counts. Fetched after: the record already has it.
      expect(await run('2026-10-15T09:00:00.000Z')).not.toEqual(deal(weakest, lcg(3)));
      const after = await run('2026-10-15T11:00:00.000Z');
      expect(countOf(after, weakest, 'kjære')).toBe(countOf(deal(weakest, lcg(3)), weakest, 'kjære'));
    });
  });
});
