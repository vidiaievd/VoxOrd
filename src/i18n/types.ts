import type { PluralForms } from './pluralize';

export interface Translations {
  /** The screen before the app: signing in, or waiting for the connection. */
  auth: {
    /** Signing in with the fingerprint (or the device PIN) instead of the password. */
    biometric: {
      promptTitle: string;
      lockedTitle: string;
      lockedBody: string;
      unlock: string;
      usePassword: string;
      offerTitle: string;
      offerMessage: string;
      offerConfirm: string;
      offerLater: string;
      settingLabel: string;
    };
    subtitle: string;
    offlineTitle: string;
    offlineBody: string;
    /** Above the tab bar while the app works from the stored session, without the server. */
    offlineSessionBanner: string;
    offlineSessionPending: string; // '{count}'
    /** A sync queue near its cap: the oldest answers are about to be dropped. */
    offlineQueueNearlyFull: string;
  };
  nav: {
    pressAgainToExit: string;
    today: string;
    courses: string;
    practice: string;
    notifications: string;
    profile: string;
    /** The Practice badge in words, for screen readers: «Practice, 18 due». */
    practiceDue: PluralForms; // '{count}'
    /** The Notifications badge in words. */
    notificationsUnread: PluralForms; // '{count}'
  };

  /** The Notifications tab (plan 06 fills in the feed). */
  notifications: {
    title: string;
    empty: string;
    emptyBody: string;
  };

  /** Home — «Today»: carry on with a course, review what is due, open another course. */
  today: {
    greeting: string; // '{name}'
    greetingPlain: string;
    subtitle: string;
    continue: string;
    continueCta: string;
    unitProgress: string; // '{done}', '{total}'
    reviewTitle: string;
    reviewDue: PluralForms; // '{count}'
    reviewNone: string;
    reviewedToday: string; // '{count}'
    reviewStart: string;
    noCourses: string;
    noCoursesDesc: string;
    /** The third header line: the one thing that is on today, in order of priority. */
    dayLine: {
      offline: string;
      welcome: string;
      reviewsAndClassToday: PluralForms; // '{count}'
      reviewsAndClassOn: PluralForms; // '{count}', '{weekday}' — a `weekdayOn` value
      classToday: string; // '{time}'
      reviewsOnly: PluralForms; // '{count}'
    };
    /** «в понедельник» — a weekday as the time of something, keyed like `Date.getDay()`. */
    weekdayOn: {
      sun: string;
      mon: string;
      tue: string;
      wed: string;
      thu: string;
      fri: string;
      sat: string;
    };
    minutes: string; // '{min}'
    onPhone: string;
    needsNetwork: string;
    nextInUnit: string;
    courseDone: string;
    courseDoneHint: string;
    courseDoneCta: string;
    unlockOnline: string;
    continueA11y: string; // '{title}', '{meta}'
    reviewDueNow: string; // '{min}'
    reviewSplit: string; // '{words}', '{exercises}'
    reviewStartShort: string;
    reviewOffline: string;
    reviewUnavailableHint: string;
    first: {
      title: string;
      bodyCatalogue: string;
      bodySchool: string;
      cta: string;
      offlineHint: string;
    };
    /** Block 3: a group opened a course to the learner. */
    groupAccess: string; // '{group}', '{school}', '{course}'
    groupAccessNoCourse: string; // '{group}', '{school}' — the course's name could not be read
    openCourse: string;
    dismiss: string;
    /** Block 6: the latest review, and what is still waiting. */
    /** Block 2 (C): the assistant's line in the flow. */
    assist: {
      ask: string; // '{unit}'
      askPlain: string;
      voice: string;
    };
    teacher: {
      title: string;
      /** C: the latest review, talked over with the assistant. */
      discuss: string;
      waiting: string; // '{count}'
      offline: string;
      aiDrafted: string;
      /** A model's word on the school's behalf (plan 80): waiting for the teacher, counted at the term, or given. */
      aiProvisional: string;
      aiAcceptedAtTerm: string;
      aiVerdict: string;
      aiQuote: string; // '{comment}'
    };
    /** Block 6b (D): the latest work a model reviewed on its own. */
    aiReviewed: {
      title: string;
      open: string;
      rewrite: string;
    };
    /** Block D2: prompts for the assistant, made on the phone. */
    suggest: {
      title: string;
      unit: string; // '{unit}'
      topic: string; // '{topic}'
      work: string; // '{title}'
    };
    /** Block D3: the period's AI-review credits — credits, never a count of reviews. */
    aiCredits: {
      line: string; // '{used}', '{total}'
      until: string; // '{date}'
      more: string;
    };
    /** Block 10. */
    soloWriting: {
      title: string;
      body: string;
      connectAi: string;
      findSchool: string;
    };
    /** A submission's state, as a tag. The engine has two verdicts, so no «partial» or «failed». */
    status: {
      passed: string;
      rewrite: string;
      atTeacher: string;
    };
    /** Block 7. */
    nextClass: {
      title: string;
      /** C: get ready for the class with the assistant. */
      prepare: string;
      today: string;
      tomorrow: string;
      inDays: PluralForms; // '{count}'
      room: string; // '{room}'
    };
    /** «пн» — a weekday on a date tile, keyed like `Date.getDay()`. */
    weekdayShort: {
      sun: string;
      mon: string;
      tue: string;
      wed: string;
      thu: string;
      fri: string;
      sat: string;
    };
    /** Block 8. */
    assignment: {
      title: string; // '{title}'
      due: string; // '{date}'
    };
    /** Block 11: what the profile says is weak — topics only, never numbers. */
    workOnThis: {
      title: string;
      body: string;
      cta: string;
      skill: {
        listening: string;
        reading: string;
        spoken: string;
        written: string;
      };
      focus: {
        vocabulary: string;
        grammar: string;
        orthography: string;
        pronunciation: string;
        phonology: string;
        pragmatics: string;
      };
    };
  };
  /** One piece of work handed to a reviewer, opened from Today or a notification. */
  submission: {
    fallbackTitle: string;
    waiting: string;
    commentBy: string; // '{teacher}'
    commentUnsigned: string;
    approvedNoComment: string;
    returnedNoComment: string;
    marks: string;
    mark: string; // '{mark}'
    loadFailed: string;
    discuss: string;
  };
  /** The learner's assistant (mobile redesign 03; platform plan 83). */
  assistant: {
    title: string;
    subtitleCourse: string; // '{course}'
    subtitleAll: string;
    close: string;
    /** Always at the top of the thread, not dismissible. */
    aiLabel: string;
    empty: string;
    contextUnit: string; // '{label}'
    contextUnitUnnamed: string;
    contextSubmission: string; // '{label}'
    contextSubmissionUnnamed: string;
    contextClass: string; // '{label}'
    contextClassUnnamed: string;
    contextWord: string; // '{label}'
    /** For screen readers: what tapping the chip does. */
    contextRemoveHint: string;
    contextRemoved: string;
    contextRestore: string;
    citeGrammarRule: string; // '{title}'
    citeLesson: string; // '{title}'
    citeUnit: string; // '{title}'
    citeWord: string; // '{title}'
    citeMyWord: string; // '{title}'
    addWord: string; // '{lemma}'
    placeholder: string;
    listening: string;
    mic: string;
    micStop: string;
    micUnavailable: string;
    send: string;
    needsNetwork: string;
    typing: string;
    refused: string;
    refusedFree: string;
    refusedQuota: string;
    silent: string;
    rateLimited: string;
    unreachable: string;
    retry: string;
    helpful: string;
    notHelpful: string;
    feedbackFailed: string;
  };
  /** What kind of material an item is, for «Lesson · 5 min». */
  itemType: {
    lesson: string;
    vocabulary_list: string;
    grammar_rule: string;
    exercise: string;
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
    signOutPendingMessage: string; // '{count}'
    signOutOfflineNote: string;
    /** Downloading the courses for use without the network. */
    offline: string;
    offlineDownload: string;
    offlineDownloading: string;
    offlineNever: string;
    /** The last download skipped media: the phone had too little free space. */
    offlineLowStorage: string;
    offlineUnitsAhead: string;
    offlineUnitsAll: string;
    offlineMediaOnCellular: string;
    offlineMediaClear: string;
    offlineMediaClearMessage: string;
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
    dueLabel: string;
    allReviewed: string;
    masteryLabel: string;
    bySkill: string;
    units: string;
    unitProgress: string; // '{done} of {total}'
    unitProgressNext: string; // '{done} of {total} · next: {title}'
    unitMaterials: PluralForms; // '{count} items'
    lockedReason: string;
    menu: string;
    downloadCourse: string;
    removeFromPhone: string;
    leaveCourse: string;
    downloadStarted: string;
    downloadFailed: string;
    removed: string;
    leaveTitle: string;
    leaveMessage: string; // '{course}'
    leaveConfirm: string;
    leaveFailed: string;
  };

  unitContents: {
    title: string;
    loadError: string;
    noItems: string;
    otherItems: string;
    untitled: string;
    duration: string; // '{minutes} min'
    statusCompleted: string;
    statusSubmitted: string;
    statusInProgress: string;
    statusAvailable: string;
    statusLocked: string;
    masteryPercent: string; // 'Mastery: {percent}%'
    header: string; // 'Unit {n} · {done} of {total}'
    saved: string;
    notSaved: string;
    saving: string;
    savedSize: string; // '{size}'
    savingPct: string; // '{pct}'
    sizeMb: string; // '{mb}'
    sizeUnderMb: string;
    secTexts: string;
    secWordsGrammar: string;
    secExercises: string; // '{count}'
    continueItem: string; // '{item}'
    nextUnit: string; // '{unit}'
    kindText: string;
    kindAudio: string;
    kindWords: string;
    kindRule: string;
    kindExercise: string;
    metaRule: string; // '{percent}'
    lockedToast: string;
    outsideWindowToast: string;
  };

  /** «My words» — words the student adds from a text (plan 75). */
  myWords: {
    deck: string;
    noDeck: string;
    title: string;
    homeHint: string;
    deckTitle: string;
    empty: string;
    emptyHint: string;
    loadError: string;
    pendingSection: string;
    wordsSection: string;
    translationPlaceholderShort: string;
    saveTranslation: string;
    saveError: string;
    courseBadge: string;
    /** On a word of a unit's list that the student added themselves. */
    mineBadge: string;
    limitReached: string;
    deleteHint: string;
    deleteTitle: string;
    deleteMessage: string;
    deleteConfirm: string;
    add: string;
    save: string;
    translationPlaceholder: string;
    /** Under the dictionary form when the text had another form: «in the text: {form}». */
    inText: string;
    fromCourse: string;
    alreadyAdded: string;
    waitingForTranslation: string;
    added: string;
    queued: string;
    refused: string;
  };
  lessonReader: {
    title: string;
    loadError: string;
    noContent: string;
    unsupportedKind: string;
    noTranslation: string;
    /** The strip under the header that plays a text's recording. */
    narration: {
      label: string;
      play: string;
      pause: string;
      back: string;
      forward: string;
      speed: string;
      error: string;
    };
    /** The button at the end of a text that leads into its exercises. */
    toExercises: string;
    /** The same button when the text leads into none: it closes the reader. */
    finish: string;
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
    /** Leaving a set mid-way, by the arrow or the phone's Back. */
    leave: {
      title: string;
      message: string;
      confirm: string;
      stay: string;
    };
    /**
     * The listening layer — plan 56 phase 7. One player, one gate and one transcript,
     * shared by every template that carries a clip, so the strings live here rather
     * than under any one type.
     */
    audio: {
      play: string;
      pause: string;
      back10: string;
      speed: string; // '{rate}×'
      speedLabel: string;
      position: string;
      playsLeft: string; // '{left} of {limit} left'
      playsNone: string;
      transcript: string;
      fragment: string; // 'Play {from}–{to}'
      lockNote: string;
      lockNoteNamed: string; // '{items}'
      lockNoteOwn: string; // '{item}'
      status: {
        idle: string;
        playing: string;
        paused: string;
        spent: string;
        failed: string;
      };
      gate: {
        title: string;
        ledeLocked: string;
        ledeOpen: string;
        listenFirst: string;
        toItems: string;
      };
      itemNoun: {
        questions: string;
        gaps: string;
        statements: string;
        sentence: string;
        sentences: string;
        pairs: string;
        pieces: string;
        lines: string;
        items: string;
        cells: string;
      };
    };
    loadError: string;
    progress: string; // '{current} / {total}'
    check: string;
    continue: string;
    finish: string;
    tryAgain: string;
    correct: string;
    incorrect: string;
    submittedForReview: string;
    expectedAnswer: string; // '{answer}'
    reviewNote: string;
    /** Free-form work with nobody to read it — `reviewer: none` (plan 79, step 2.1c). */
    noReviewer: string;
    noReviewerNote: string;
    /** Free-form work a model reads — `reviewer: ai` (plan 79, step 2.3d). */
    aiHandedIn: string;
    aiHandedInNote: string;
    /** A model's review of the work of a learner nobody reviews (plan 79, step 2.3d). */
    aiReview: {
      reading: string;
      slow: string;
      askAgain: string;
      dropped: string;
      approved: string;
      returned: string;
      label: string;
      caveat: string;
      failed: string;
      retry: string;
      noRemarks: string;
      sentence: string; // '{n}'
      question: string; // '{n}'
      wholeText: string;
      wholeAnswer: string;
      marksTitle: string;
      mark: string; // '{mark}'
      unnamed: string;
      dispute: string;
      reasonLabel: string;
      reasonPlaceholder: string;
      disputeNote: string;
      send: string;
      sending: string;
      sendFailed: string;
      disputed: string;
      /** A school's work under a model-first policy (plan 80). */
      provisionalTitle: string;
      provisionalNote: string; // '{date}'
      provisionalNoteNoTerm: string;
      acceptedAtTermTitle: string;
      acceptedAtTermNote: string;
      /** A reading aloud checked by the machine (plan 82). */
      caveatReading: string;
      reasonPlaceholderReading: string;
      readingCheck: {
        prompt: string; // '{n}'
        passed: string;
        notPassed: string;
        count: string; // '{read}', '{total}', '{percent}'
        mark: string; // '{percent}'
        heard: string;
        nothingHeard: string;
        legend: {
          word: string;
          heard: string;
          missed: string;
          misread: string;
          extra: string;
        };
        carried: string; // '{label}'
        carriedCount: PluralForms; // '{count}'
        pace: string; // '{wpm}'
        pronunciation: {
          title: string;
          scores: string; // '{accuracy}', '{fluency}', '{completeness}'
          prosody: string; // '{prosody}'
          unclear: string;
          note: string;
        };
      };
      aspect: {
        grammar: string;
        order: string;
        lexis: string;
        register: string;
        meaning: string;
        alternative: string;
        task: string;
        structure: string;
        content: string;
      };
    };
    setComplete: string;
    setCompleteDesc: string;
    done: string;
    unsupportedTemplate: string;
    unsupportedTemplateDesc: string; // '{template}'
    translate: {
      selfCheck: {
        button: string;
        spent: string;
        failed: string;
        summary: string;
        exact: string;
        typo: string;
        near: string;
        off: string;
        noKey: string;
        empty: string;
        diverging: PluralForms;
        requires: string;
        avoid: string;
      };
      bothWays: string;
      direction: string; // '{from}', '{to}'
      numberedLang: string; // '{n}', '{lang}'
      numberedDirection: string; // '{n}', '{from}', '{to}'
      progress: string; // '{written}', '{total}'
      placeholder: string; // '{lang}'
      showHint: string;
      hideHint: string;
      itemApproved: string;
      itemWithTeacher: string;
    };
    gapFill: {
      restored: string; // '{correct}', '{total}'
      startOver: string;
      remaining: string; // '{count}'
      check: string;
      checkAgain: string; // '{n}'
      fillEveryGap: string;
      checkFailed: string;
      revealFailed: string;
      showAnswers: string;
      wrong: string;
      answer: string; // '{word}'
      emptyGap: string; // '{label}'
    };
    errorCorrection: {
      selfCheck: {
        button: string;
        spent: string;
        failed: string;
        summary: string;
        itemClean: string;
        itemAll: string;
        itemNone: string;
        itemSome: string;
        remaining: PluralForms;
        stray: PluralForms;
      };
      toFind: PluralForms;
      inThis: PluralForms;
      changes: PluralForms;
      progress: string;
      howTo: string;
      wordLabel: string;
      insertBeforeLabel: string;
      insertEnd: string;
      insertedLabel: string;
      strikePlaceholder: string;
      done: string;
      strike: string;
      restore: string;
      insertBefore: string;
      removeInsert: string;
      cancel: string;
      addAtEnd: string;
      noChanges: string;
      reset: string;
      types: string;
      showHint: string;
      hideHint: string;
      type: Record<'form' | 'order' | 'extra' | 'missing' | 'spelling' | 'function', string>;
    };
    textOrder: {
      howTo: string;
      pickPlace: string;
      lineLabel: string; // '{n}', '{text}'
      up: string;
      down: string;
      placed: string; // '{placed}', '{total}'
    };
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
      /** Pass over a question and come back to it — nothing is sent. */
      skip: string;
      backToSkipped: string; // '{count}'
      /** Every question answered or skipped, some skipped: the screen before sending. */
      reviewTitle: string;
      reviewDesc: string; // '{answered}', '{total}'
      /** Sending a set with questions left unanswered. */
      confirmTitle: string;
      confirmMessage: PluralForms; // '{count}'
      confirmSend: string;
      doneSkipped: string; // '{count}'
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
      doneAi: string;
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
    /** Plan 66: tiles put into zones, the whole board checked as one block. */
    sortIntoBuckets: {
      check: string;
      checkCount: string; // '{n}'
      checking: string;
      retryWrong: string; // '{n}'
      showKey: string;
      attempt: string; // '{n}'
      attemptOf: string; // '{n}', '{max}'
      score: string; // '{correct}', '{total}'
      remaining: string; // '{n}'
      poolTitle: string;
      zoneLabel: string; // '{label}', '{n}'
      zoneIdle: string;
      zoneTap: string;
      /** Shown, and announced, while a tile is in hand. */
      selected: string; // '{text}'
      putBack: string;
      tilePlaced: string; // '{text}', '{bucket}'
      tileLocked: string; // '{text}', '{bucket}'
      tileWrong: string; // '{text}', '{bucket}'
      tileKey: string; // '{text}', '{bucket}'
      rule: string;
      /** The tile's own recording, under the per-item audio source. */
      listen: string; // '{text}'
      passed: string;
      notPassed: string;
      firstScore: string; // '{score}', '{total}', '{threshold}'
      doneHint: string;
      sendFailed: string;
      closedAlready: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
    };
    /** Plan 67: words marked in a passage, a question at a time on one attempt. */
    highlightInText: {
      check: string;
      checkCount: string; // '{n}'
      retry: string;
      showKey: string;
      next: string;
      clear: string;
      attempt: string; // '{n}'
      attemptOf: string; // '{n}', '{max}'
      tapWords: string;
      tapOrDrag: string;
      count: string; // '{n}'
      marked: string; // '{n}'
      markedOf: string; // '{n}', '{total}'
      verdict: string; // '{correct}', '{total}'
      verdictExtra: string; // '{correct}', '{total}', '{fp}'
      score: string; // '{pct}'
      /** When extra marks cost something and the percentage is after the deduction. */
      scoreAfter: string; // '{pct}'
      near: PluralForms; // '{count}'
      /** The live region: counts first and alone (AC-X8). */
      announce: string; // '{correct}', '{total}'
      announceExtra: string; // '{correct}', '{total}', '{fp}'
      rail: string; // '{n}', '{total}', '{done}'
      legendRight: string;
      legendExtra: string;
      legendMissed: string;
      legendKey: string;
      /** Read out on a word the student has marked. */
      stateMarked: string;
      /** Read out on a word of a partial hit. */
      stateNear: string;
      sendFailed: string;
      closedAlready: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
    };
    /** Plan 69: a paradigm table of lemmas × forms, checked as one block. */
    inflectionTable: {
      defaultInstruction: string;
      check: string;
      retryWrong: string; // '{n}', '{max}'
      progress: string;
      bankLabel: string;
      bankHint: string;
      bankSelected: string; // '{form}'
      cellFor: string; // '{lemma}', '{slot}'
      cellRight: string;
      cellWrong: string;
      /** Bank mode: a filled cell with nothing in hand. */
      cellClear: string;
      rowAll: string;
      rowPart: string; // '{ok}', '{n}'
      score: PluralForms; // '{k}', '{count}'
      passed: string;
      below: string; // '{pct}'
      wrote: string;
      blank: string;
      allRight: PluralForms; // '{count}'
      nearDiacritic: string;
      nearEnding: string;
      doneHint: string;
      sendFailed: string;
      closedAlready: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
    };
    /** `read_aloud` — speech, recorded on the phone and graded by a teacher (plan 70). */
    readAloud: {
      defaultTitle: string;
      unavailable: string;
      unavailableDesc: string;
      loadFailed: string;
      noPrompts: string;
      promptN: string; // '{n}'
      imagePlaceholder: string;
      rubricGuide: string;
      progress: string; // '{n}', '{total}'
      mic: {
        head: string;
        hint: string;
        ok: string;
        silent: string;
        ready: string;
        denied: string;
        noDevice: string;
      };
      retry: string;
      prep: {
        head: string;
        subRead: string;
        subMonologue: string;
        subDialogue: string;
        startNow: string;
      };
      countSub: string;
      rec: {
        head: string;
        max: string; // '{time}'
        stop: string;
      };
      idle: {
        head: string; // '{n}', '{total}'
        range: string; // '{min}', '{max}'
      };
      interrupted: string;
      takeLabel: string; // '{n}'
      play: string; // '{label}'
      pause: string;
      uploadingTake: string;
      uploadFailed: string;
      noListenBack: string;
      short: string; // '{min}'
      start: string;
      again: string; // '{left}'
      spent: PluralForms; // '{count}'
      chosenNote: string;
      prev: string;
      next: string;
      submit: string;
      sending: string;
      left: PluralForms; // '{count}'
      tooShort: string; // '{labels}'
      uploading: string;
      readByTeacher: string;
      steps: {
        atTeacher: string;
        /** The machine checks the reading by itself (plan 82). */
        atAi: string;
        graded: string;
      };
      sentTitle: string;
      sentBody: string;
      /** Handed in with nobody to listen (plan 79, 2.1c). */
      unreadTitle: string;
      unreadBody: string;
      /** Handed in to the machine (plan 82). */
      aiTitle: string;
      aiBody: string;
      aiSlow: string;
      /** The machine was asked and could not check it. */
      droppedBody: string;
      carried: { title: string; inAttempt: string }; // '{count}' / '{attempt}'
      submittedTake: string; // '{label}'
      refused: {
        retake: string; // '{labels}'
        notReady: string; // '{labels}'
        length: string; // '{labels}'
      };
      mediaUnavailable: string;
      sendFailed: string;
      graded: {
        outcome: {
          passed: string;
          rewrite: string;
          failed: string;
        };
        points: string; // '{score}', '{max}'
        passedCount: string; // '{k}', '{n}'
        promptPassed: string;
        promptAgain: string;
        hidden: string;
        mark: string; // '{mark}'
        model: string;
        redo: string;
        skip: string;
      };
      card: {
        facts: PluralForms; // '{mode}', '{count}'
        modeRead: string;
        modeMonologue: string;
        modeDialogue: string;
        rules: PluralForms; // '{count}'
        rulesListen: PluralForms; // '{count}'
        start: string;
      };
    };
    /** Plan 73: a blank filled in from a text or a recording, checked as one block. */
    informationTransfer: {
      defaultTitle: string;
      defaultInstruction: string;
      form: string;
      fieldN: string; // '{n}'
      stepOf: string; // '{k}', '{n}'
      next: string;
      check: string;
      checking: string;
      retry: PluralForms; // '{count}', '{k}', '{max}'
      retryUnlimited: PluralForms; // '{count}'
      noKey: string;
      progress: string;
      passed: string;
      tryAgain: string;
      scoreLine: string; // '{pct}', '{need}'
      requiredMissed: string;
      doneHint: string;
      sendFailed: string;
      closedAlready: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
      mark: {
        ok: string;
        typo: string;
        unread: string;
        empty: string;
        wrong: string;
      };
      hint: {
        format: string; // '{form}'
        answer: string;
        unreadTime: string;
        unreadDate: string;
        unreadNumber: string;
        unreadMoney: string;
        unreadPhone: string;
      };
    };
    /** `minimal_pairs` — one word heard, the two or three it could have been (plan 72). */
    minimalPairs: {
      defaultTitle: string;
      defaultInstruction: string;
      progress: string;
      play: string;
      pause: string;
      playWord: string;
      playsLeft: string;
      noPlaysLeft: string;
      freePlay: string;
      synthetic: string;
      retry: string;
      right: string;
      wrong: string;
      compare: string;
      chosen: string;
      heard: string;
      next: string;
      seeResult: string;
      empty: {
        title: string;
        body: string;
      };
      failure: {
        media: string;
        probe: string;
        answer: string;
        finish: string;
        start: string;
        emptySet: string;
        tryAgain: string;
      };
      summary: {
        passed: string;
        again: string;
        score: string;
        hearPair: string;
        wordsReturn: string;
        contrastScheduled: string;
        contrastNotHere: string;
        allRight: string;
        newRound: string;
        sittingsSpent: PluralForms;
      };
      card: {
        probes: PluralForms;
        minutes: string;
        defaultInstruction: string;
        plays: string;
        freePlay: string;
        answerAtOnce: string;
        hearDifference: string;
        start: string;
      };
      unavailable: string;
      unavailableDesc: string;
    };
    /** `dictation` — a recording written down a sentence at a time (plan 68). */
    dictation: {
      check: string;
      retry: string;
      showKey: string;
      next: string;
      finish: string;
      attempt: string; // '{n}'
      attemptOf: string; // '{n}', '{max}'
      fieldSentence: string; // '{n}'
      fieldWhole: string;
      words: PluralForms; // '{count}'
      /** Typed of expected, under `showWordCount`. */
      wordsOf: PluralForms; // '{n}', '{count}'
      placeholder: string;
      placeholderGated: string;
      corrected: string;
      key: string;
      passed: string;
      /** The verdict's head; the typo count and the half-credit note follow it. */
      verdictHead: PluralForms; // '{correct}', '{count}'
      typos: PluralForms; // '{count}'
      halfCredit: string;
      focusDefault: string;
      lockNote: string;
      rail: string; // '{n}', '{total}'
      summaryCount: PluralForms; // '{n}', '{count}'
      summarySub: string;
      tally: {
        eq: string; // '{n}'
        near: string; // '{n}'
        wrong: string; // '{n}'
        missing: string; // '{n}'
        extra: string; // '{n}'
      };
      legend: {
        eq: string;
        near: string;
        wrong: string;
        missing: string;
        extra: string;
      };
      /** Read out for one deviation in the corrected line (AC-X11). */
      sr: {
        sub: string; // '{wrote}', '{expected}'
        missing: string; // '{expected}'
        extra: string; // '{wrote}'
      };
      sendFailed: string;
      closedAlready: string;
      tooFast: string;
      empty: string;
      emptyDesc: string;
      unavailable: string;
      unavailableDesc: string;
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
