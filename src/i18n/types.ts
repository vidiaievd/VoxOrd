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
