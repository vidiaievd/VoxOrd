import type { PluralForms } from './pluralize';

export interface Translations {
  nav: {
    home: string;
    settings: string;
    courses: string;
  };

  home: {
    appSubtitle: string;
    learned: string;
    wordCount: string; // '{learned}/{total} learned'
    myDecks: string;
    deckWords: string; // '{count} words'
    studyNow: {
      title: string;
      courseDue: PluralForms; // '{count} course words due'
      localDue: PluralForms; // '{count} words due in your decks'
    };
  };

  deckCard: {
    new: string;
    repeat: string;
    done: string;
    noDecksYet: string;
  };

  card: {
    tapToReveal: string;
    word: string;
    translation: string;
    allDone: string;
    allDoneDesc: string; // '{deckTitle}'
    backToDecks: string;
    repeat: string;
    learned: string;
    flipFirst: string;
    bucket: {
      new: string;
      learning: string;
      learned: string;
    };
  };

  settings: {
    title: string;
    statistics: string;
    languageRegion: string;
    appearance: string;
    learning: string;
    about: string;
    uiLanguage: string;
    learningLang: string;
    learningLangValNO: string;
    theme: string;
    designTheme: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    cardModes: string;
    cardsPerSession: string;
    showWordForms: string;
    showOrdboken: string;
    activeCount: string;
    version: string;
    feedback: string;
    sectionLearning: string;
    cardModesActive: string; 
    spellingHint: string;
    spellingHintAlways: string;
    spellingHintAfterMistake: string;
    spellingHintNever: string;
    account: string;
    signedInAs: string;
    signOut: string;
    signOutConfirmTitle: string;
    signOutConfirmMessage: string;
    developer: string;
    apiBaseUrl: string;
    apiBaseUrlSave: string;
    apiBaseUrlSaved: string;
  };

  courses: {
    title: string;
    loginEmail: string;
    loginPassword: string;
    loginSubmit: string;
    loginSubmitting: string;
    loginMfaNotSupported: string;
    noCoursesYet: string;
    noCoursesYetDesc: string;
    loadError: string;
    retry: string;
  };

  courseHome: {
    loadError: string;
    noUnits: string;
    statusDone: string;
    statusActive: string;
    statusLocked: string;
    mastery: string;
    skillVocabulary: string;
    skillGrammar: string;
    skillReading: string;
    skillListening: string;
    skillSpeaking: string;
    skillWriting: string;
    reviewsDue: PluralForms; // '{count} reviews due'
    startReview: string;
  };

  unitContents: {
    title: string;
    loadError: string;
    noItems: string;
    otherItems: string;
    untitled: string;
    duration: string; // '{minutes} min'
    statusCompleted: string;
    statusInProgress: string;
    statusAvailable: string;
    statusLocked: string;
    masteryPercent: string; // 'Mastery: {percent}%'
  };

  lessonReader: {
    title: string;
    loadError: string;
    noContent: string;
    unsupportedKind: string;
    noTranslation: string;
    markAsRead: string;
  };

  grammarRuleReader: {
    title: string;
    loadError: string;
    noContent: string;
    goToPractice: string;
    noPracticeExercises: string;
    practiceLoadError: string;
  };

  vocabulary: {
    title: string;
    loadError: string;
    noItems: string;
    noTranslation: string;
    wordCount: string; // '{count} words'
    forms: string;
    examples: string;
    register: string; // 'Register: {register}'
    posNoun: string;
    posVerb: string;
    posAdjective: string;
    posAdverb: string;
    posPronoun: string;
    posPreposition: string;
    posConjunction: string;
    posInterjection: string;
    posNumeral: string;
    posParticle: string;
    posPhrase: string;
    posOther: string;
    saveToDeck: string;
    updateDeck: string;
    updateDeckTitle: string;
    updateDeckMessage: string;
    updateDeckConfirm: string;
    importDone: string; // '{imported} added, {updated} updated'
    importRemoved: string; // '{removed} removed'
    importSkipped: string; // '{skipped} without translation'
    importError: string;
    coursesGroup: string;
  };

  exerciseRunner: {
    loadError: string;
    progress: string; // '{current} / {total}'
    check: string;
    continue: string;
    finish: string;
    tryAgain: string;
    correct: string;
    incorrect: string;
    submittedForReview: string;
    setComplete: string;
    setCompleteDesc: string;
    done: string;
    unsupportedTemplate: string;
    unsupportedTemplateDesc: string; // '{template}'
    translateToTargetLabel: string; // '{language}'
    translateFromTargetLabel: string; // '{language}'
    translatePlaceholder: string;
    matchPairsHint: string;
    matchPairsRemaining: string; // '{count}'
    matchPairsEmptySlot: string;
    matchPairsCorrect: string;
    matchPairsWrong: string;
    shortAnswerPlaceholder: string;
    modelAnswer: string;
    writingTaskPlaceholder: string;
    /** Which kind of text this is — the badge above the task. */
    writingTaskMode: {
      letter: string;
      essay: string;
      picture: string;
      retell: string;
      free: string;
    };
    writingTaskRegister: {
      formal: string;
      informal: string;
    };
    writingTaskLetterLine: string; // '{recipient}', '{register}'
    writingTaskImageMissing: string;
    writingTaskChecklist: string;
    writingTaskRubric: string;
    writingTaskPassLine: string; // '{pass}', '{max}'
    writingTaskTopLevel: string; // '{descriptor}'
    writingTaskPhrases: string;
    writingTaskWordRange: string; // '{count}', '{min}', '{max}'
    writingTaskWordRangeOpen: string; // '{count}', '{min}'
    writingTaskPasteOff: string;
    /** Why Check is still greyed out. */
    writingTaskNeedMore: PluralForms; // '{count}'
    writingTaskTooLong: string; // '{max}'
    writingTaskUnavailable: string;
    writingTaskUnavailableDesc: string;
    /**
     * The new plan-51 form: a set of open questions, handed in one at a time and
     * graded on the server (the anchors it is matched against are the answer).
     */
    shortAnswer: {
      position: string; // '{n}', '{total}'
      placeholder: string;
      handIn: string;
      sending: string;
      irreversible: string;
      next: string;
      last: string;
      covered: string; // '{covered}', '{total}'
      tooShort: string;
      modelLabel: string;
      /** `wait` is a handed-in answer with no readable verdict — never a fourth outcome. */
      verdict: {
        pass: string;
        partial: string;
        fail: string;
        wait: string;
      };
      routing: string;
      routingIfUnclear: string;
      doneTitle: string;
      doneTally: string; // '{pass}', '{partial}', '{fail}'
      doneTeacher: string;
      doneHint: string;
      sendFailed: string;
      handedInAlready: string;
      empty: string;
      unavailable: string;
      unavailableDesc: string;
    };
    /**
     * The plan-52 form: a set of sentences over one field schema, checked a sentence at a
     * time on the server — which field a piece belongs in is the answer key.
     */
    sentenceSchema: {
      defaultInstruction: string;
      bankLabel: string;
      /** What the one nameless slot of a sequence-only set is called out loud. */
      slot: string;
      fieldDropLabel: string; // '{field}'
      takeBack: string; // '{word}'
      sourceLabel: string;
      remaining: string; // '{count}'
      position: string; // '{index}', '{total}'
      attemptNo: string; // '{count}'
      check: string; // '{placed}', '{total}'
      fix: string; // '{count}'
      reveal: string;
      skip: string;
      skippedEarlier: string;
      nextSentence: string;
      finishSet: string;
      /** The defaults the kernel sends as a code rather than as prose (plan 52 §5). */
      wrongOrder: string;
      notInSentence: string;
      setDone: string; // '{count}'
      setTally: string; // '{solved}', '{revealed}'
      setTallySkipped: string; // '{solved}', '{revealed}', '{skipped}'
      doneHint: string;
      nothingToSolve: string;
      checkFailed: string;
      closedAlready: string;
      unavailable: string;
      unavailableDesc: string;
      clause: {
        main: string;
        sub: string;
        yesno: string;
        hv: string;
        imp: string;
      };
    };
    /**
     * The plan-53 form: a set of questions answered one at a time, each with its own
     * budget of tries, judged on the server so the key can be dosed — `keyOptionId` and
     * the rule behind it arrive only once a question is closed.
     */
    multipleChoice: {
      position: string; // '{n}', '{total}'
      check: string;
      /** Shown instead of a Check button when the author made the tap the hand-in. */
      tapAnswer: string;
      tryAgain: string;
      showAnswer: string;
      next: string;
      finish: string;
      attempt: string; // '{n}'
      right: string;
      /** Stands in when a wrong pick has no rebuttal written against it. */
      generic: string;
      sendFailed: string;
      closedAlready: string;
      doneTitle: string;
      doneScore: string; // '{score}', '{total}'
      doneHint: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
    };
    /** The plan-54 form: a table of statements sharing one set of answer columns. */
    multipleChoiceGroup: {
      answered: string; // '{n}', '{total}'
      /** The way back to the lesson the statements are about, in `link` mode. */
      toText: string;
      check: string;
      remaining: string; // '{n}'
      retryWrong: string;
      showKey: string;
      attempt: string; // '{n}'
      /** The heading of the score card while checks are left. */
      wrongCount: string; // '{n}'
      allRight: string;
      lookAgain: string;
      passed: string;
      notPassed: string;
      scoreLine: string; // '{pct}', '{threshold}'
      doneHint: string;
      sendFailed: string;
      closedAlready: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
      /** The old `items[]` form, which this app has never been able to play. */
      unavailableLegacyDesc: string;
    };
    resultsExcellentTitle: string;
    resultsExcellentMessage: string;
    resultsGoodTitle: string;
    resultsGoodMessage: string;
    resultsOkayTitle: string;
    resultsOkayMessage: string;
    resultsKeepGoingTitle: string;
    resultsKeepGoingMessage: string;
    resultsAccuracy: string;
    resultsCorrectOf: string; // '{correct}', '{total}'
    resultsTime: string;
    resultsByOutcome: string;
    resultsNeedsReview: string;
  };

  review: {
    title: string;
    showAnswer: string;
    again: string;
    hard: string;
    good: string;
    easy: string;
    noTranslation: string;
    sessionDone: string;
    nothingDue: string;
    reviewedCount: string; // '{count} words reviewed'
    pendingSync: string; // '{count} answers waiting to sync'
    loadError: string;
    offlineLoad: string;
    submitting: string;
    stillDue: string; // '{count} words left for next time'
    notImported: string; // '{count} due words are not in a saved list'
    quotaMetTitle: string;
    quotaMetBody: string;
    quotaMetFinish: string;
    quotaMetCarryOn: string;
    phasePreview: string;
    phaseListening: string;
    phaseQuiz: string;
    phaseSpelling: string;
  };

  audioLesson: {
    stageListen: string;
    stageGapFill: string;
    stageComprehension: string;
    listenHeading: string;
    listenBody: string;
    listenCta: string;
    playError: string;
    gapFillHeading: string;
    gapFillBody: string;
    comprehensionHeading: string;
    comprehensionBody: string;
    doneTitle: string;
    doneBody: string;
    doneCta: string;
  };

  stats: {
    decks: string;
    words: string;
    learned: string;
    progress: string;
  };

  common: {
    back: string;
    cancel: string;
    save: string;
    close: string;
    offline: string;
  };
}
