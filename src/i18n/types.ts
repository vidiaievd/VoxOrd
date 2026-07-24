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
  };
}
