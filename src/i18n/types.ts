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
    reviewsDue: string; // '{count} reviews due'
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
  };

  lessonReader: {
    title: string;
    loadError: string;
    noContent: string;
    unsupportedKind: string;
    noTranslation: string;
    markAsRead: string;
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
    correct: string;
    incorrect: string;
    submittedForReview: string;
    expectedAnswer: string;
    setComplete: string;
    setCompleteDesc: string;
    done: string;
    unsupportedTemplate: string;
    unsupportedTemplateDesc: string; // '{template}'
    translateToTargetLabel: string; // '{language}'
    translateFromTargetLabel: string; // '{language}'
    translatePlaceholder: string;
    sentenceSchemaHint: string;
    shortAnswerPlaceholder: string;
    modelAnswer: string;
    writingTaskPlaceholder: string;
    writingTaskWordCount: string; // '{count}', '{min}', '{max}'
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
