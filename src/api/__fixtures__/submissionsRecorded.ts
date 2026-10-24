/*
 * Answers recorded 2026-10-24 on the dev stack for student@email.com (school Nordick):
 * `GET /api/v1/attempts/mine?limit=20`, the same with `status=pending&limit=100`, the teachers'
 * names from `GET /api/v1/profiles?userIds=` and `GET /api/v1/analytics/mastery/me`. The
 * submissions and mastery ports are tested against these, so a test fails where the real
 * contract would.
 */

export const recordedSubmissions = {
  "mine": {
    "items": [
      {
        "attemptId": "7534e042-7fa0-4c6f-bff8-5ed5e043d0ab",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-22T04:35:59.413Z",
        "status": "approved",
        "attemptNo": 1,
        "decision": {
          "verdict": "approved",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-10-22T04:36:14.335Z",
          "comment": null,
          "aiDrafted": false
        },
        "canResubmit": false
      },
      {
        "attemptId": "b400f4b2-bd17-4b59-a5c7-c55c1f5dbf05",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-22T04:35:59.366Z",
        "status": "approved",
        "attemptNo": 1,
        "decision": {
          "verdict": "approved",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-10-22T04:36:14.300Z",
          "comment": null,
          "aiDrafted": true
        },
        "canResubmit": false
      },
      {
        "attemptId": "755608d6-40ff-4ad8-9277-36457e521685",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-22T04:35:59.293Z",
        "status": "approved",
        "attemptNo": 1,
        "decision": {
          "verdict": "approved",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-10-22T04:36:14.251Z",
          "comment": null,
          "aiDrafted": true
        },
        "canResubmit": false
      },
      {
        "attemptId": "aa933fd5-5b0c-4b5d-94ea-463e981bc861",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-22T03:54:32.744Z",
        "status": "approved",
        "attemptNo": 1,
        "decision": {
          "verdict": "approved",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-10-22T04:20:20.117Z",
          "comment": "",
          "aiDrafted": false
        },
        "canResubmit": false
      },
      {
        "attemptId": "756a0435-9c06-4251-a939-e010209c6a6f",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-22T03:53:45.415Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "d5670936-1877-49d6-b037-dad8de11882d",
        "exerciseId": "59d8e3c3-2711-5aa9-af83-8dba5107f37d",
        "templateCode": "short_answer",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "9B — Fra utvandring til innvandring",
          "exercise": "Ответьте на вопрос по тексту 9B."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-15T04:20:09.907Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "6313086b-8224-41a8-80f9-6099909522e6",
        "exerciseId": "84c941af-dd1d-5d31-9acb-937f0656c63f",
        "templateCode": "error_correction",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1A — Bartek søker ny jobb",
          "exercise": "В каждом предложении один фрагмент содержит ошибку в косвенной речи. Найдите и исправьте её."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-15T04:19:33.743Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "859cd2ee-69cd-44e8-a9ea-b3c509668b5d",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-15T04:19:33.702Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "acf805a8-5deb-41d4-9c7c-9278a52a7aeb",
        "exerciseId": "dfbd5ab6-9b09-4917-8fbc-ace408024f4e",
        "templateCode": "read_aloud",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1 — Grammatikk og øvelser",
          "exercise": "Les teksten høyt og tydelig."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-07T13:25:20.028Z",
        "status": "approved",
        "attemptNo": 2,
        "decision": {
          "verdict": "approved",
          "by": "teacher",
          "byUserId": "4db6c684-95cc-4637-b4da-92e8068eebaf",
          "at": "2026-10-07T13:26:44.490Z",
          "comment": "",
          "aiDrafted": false
        },
        "canResubmit": false
      },
      {
        "attemptId": "1755d89a-2a67-487a-85f2-2625d26dc882",
        "exerciseId": "dfbd5ab6-9b09-4917-8fbc-ace408024f4e",
        "templateCode": "read_aloud",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1 — Grammatikk og øvelser",
          "exercise": "Les teksten høyt og tydelig."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-07T10:08:28.619Z",
        "status": "returned",
        "attemptNo": 1,
        "decision": {
          "verdict": "returned",
          "by": "teacher",
          "byUserId": "4db6c684-95cc-4637-b4da-92e8068eebaf",
          "at": "2026-10-07T10:09:12.356Z",
          "comment": "",
          "aiDrafted": false
        },
        "canResubmit": true
      },
      {
        "attemptId": "52d1b1e9-dcce-4e89-a869-d24cad689da2",
        "exerciseId": "c601d31a-7059-5880-b91a-308d6700e2cb",
        "templateCode": "short_answer",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1A — Bartek søker ny jobb",
          "exercise": "Ответьте на вопросы по тексту 1A своими словами."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-09-14T02:54:42.935Z",
        "status": "returned",
        "attemptNo": 3,
        "decision": {
          "verdict": "returned",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-09-14T02:54:42.986Z",
          "comment": "Skriv hele setninger.",
          "aiDrafted": false
        },
        "canResubmit": true
      },
      {
        "attemptId": "ec7efaf7-e198-44a9-a95d-fc6543b4f5b2",
        "exerciseId": "c601d31a-7059-5880-b91a-308d6700e2cb",
        "templateCode": "short_answer",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1A — Bartek søker ny jobb",
          "exercise": "Ответьте на вопросы по тексту 1A своими словами."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-09-14T02:52:28.646Z",
        "status": "returned",
        "attemptNo": 2,
        "decision": {
          "verdict": "returned",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-09-14T02:52:36.023Z",
          "comment": "Svarene er for korte — skriv hele setninger med egne ord.",
          "aiDrafted": false
        },
        "canResubmit": false
      },
      {
        "attemptId": "e6e8b283-0c13-4420-9c5c-c30b6e92f2bf",
        "exerciseId": "c601d31a-7059-5880-b91a-308d6700e2cb",
        "templateCode": "short_answer",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1A — Bartek søker ny jobb",
          "exercise": "Ответьте на вопросы по тексту 1A своими словами."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-09-13T19:19:09.251Z",
        "status": "returned",
        "attemptNo": 1,
        "decision": {
          "verdict": "returned",
          "by": "teacher",
          "byUserId": "0b2f2404-854a-4ea5-9d33-816db353983f",
          "at": "2026-09-13T19:19:46.607Z",
          "comment": "Svarene er for korte — skriv hele setninger med egne ord.",
          "aiDrafted": false
        },
        "canResubmit": false
      },
      {
        "attemptId": "45dbf597-1276-47ee-b5be-4235a94dba55",
        "exerciseId": "11d4cebf-2dab-5eed-a888-e5f7b7281e5e",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Ny i Norge A2 — privattimer",
          "module": "19B — Kontakt med nordmenn",
          "exercise": "Переведите на норвежский."
        },
        "containerId": "8ff448cf-4fd6-50ad-a41d-4dd7a623e612",
        "schoolId": "f17c0fb5-7ca6-4760-94d1-e673dd447cce",
        "submittedAt": "2026-09-05T19:57:10.006Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "bb960919-0f22-497e-9a70-29c6b0ce7922",
        "exerciseId": "1ba01265-62be-5017-a9bf-1b96f597d4f3",
        "templateCode": "writing_task",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Ny i Norge A2 — privattimer",
          "module": "19 — Øvelser (hele leksjonen)",
          "exercise": "Напишите текст о своём опыте контакта с норвежцами."
        },
        "containerId": "8ff448cf-4fd6-50ad-a41d-4dd7a623e612",
        "schoolId": "f17c0fb5-7ca6-4760-94d1-e673dd447cce",
        "submittedAt": "2026-09-05T19:56:45.117Z",
        "status": "approved",
        "attemptNo": 1,
        "decision": {
          "verdict": "approved",
          "by": "teacher",
          "byUserId": "9837beac-cb5d-42b8-9037-54e17f8b7c82",
          "at": "2026-10-23T19:28:19.724Z",
          "comment": "",
          "aiDrafted": false
        },
        "canResubmit": false
      }
    ],
    "nextCursor": null
  },
  "pending": {
    "items": [
      {
        "attemptId": "756a0435-9c06-4251-a939-e010209c6a6f",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-22T03:53:45.415Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "d5670936-1877-49d6-b037-dad8de11882d",
        "exerciseId": "59d8e3c3-2711-5aa9-af83-8dba5107f37d",
        "templateCode": "short_answer",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "9B — Fra utvandring til innvandring",
          "exercise": "Ответьте на вопрос по тексту 9B."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-15T04:20:09.907Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "6313086b-8224-41a8-80f9-6099909522e6",
        "exerciseId": "84c941af-dd1d-5d31-9acb-937f0656c63f",
        "templateCode": "error_correction",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1",
          "module": "1A — Bartek søker ny jobb",
          "exercise": "В каждом предложении один фрагмент содержит ошибку в косвенной речи. Найдите и исправьте её."
        },
        "containerId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-15T04:19:33.743Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "859cd2ee-69cd-44e8-a9ea-b3c509668b5d",
        "exerciseId": "5471c248-94dd-509f-9e6c-09191e87e067",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Norsk B1 — Stein på stein",
          "module": null,
          "exercise": "Переведите предложение на норвежский."
        },
        "containerId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "submittedAt": "2026-10-15T04:19:33.702Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      },
      {
        "attemptId": "45dbf597-1276-47ee-b5be-4235a94dba55",
        "exerciseId": "11d4cebf-2dab-5eed-a888-e5f7b7281e5e",
        "templateCode": "translate_to_target",
        "targetLanguage": "nb",
        "exercisePath": {
          "course": "Ny i Norge A2 — privattimer",
          "module": "19B — Kontakt med nordmenn",
          "exercise": "Переведите на норвежский."
        },
        "containerId": "8ff448cf-4fd6-50ad-a41d-4dd7a623e612",
        "schoolId": "f17c0fb5-7ca6-4760-94d1-e673dd447cce",
        "submittedAt": "2026-09-05T19:57:10.006Z",
        "status": "pending",
        "attemptNo": 1,
        "decision": null,
        "canResubmit": false
      }
    ],
    "nextCursor": null
  },
  "profiles": [
    {
      "userId": "0b2f2404-854a-4ea5-9d33-816db353983f",
      "displayName": "school"
    },
    {
      "userId": "4db6c684-95cc-4637-b4da-92e8068eebaf",
      "displayName": "teacher4"
    },
    {
      "userId": "9837beac-cb5d-42b8-9037-54e17f8b7c82",
      "displayName": "Dmytro Vidiaiev",
      "firstName": "Dmytro",
      "lastName": "Vidiaiev"
    }
  ],
  "mastery": {
    "userId": "182558cf-f90b-464f-84a4-5a68610b7f94",
    "courseId": null,
    "minWeightedSample": 8,
    "weakest": [
      {
        "skill": "reading",
        "focus": "unknown",
        "successRateEwma": 0.2724881187424809,
        "reason": "forgets",
        "meanStability": 0.14505297223282157,
        "medianSecondsPerItem": 61.227611094763944,
        "attempts": 67,
        "weightedSample": 43.33333333333335,
        "lastAttemptAt": "2026-10-04T06:35:45.085Z"
      },
      {
        "skill": "reading",
        "focus": "grammar",
        "successRateEwma": 0.5849943278543543,
        "reason": "watch",
        "meanStability": 1.1544144594315005,
        "medianSecondsPerItem": 70.97895976439086,
        "attempts": 29,
        "weightedSample": 21,
        "lastAttemptAt": "2026-10-15T04:20:09.758Z"
      },
      {
        "skill": "reading",
        "focus": "vocabulary",
        "successRateEwma": 0.6444691977395344,
        "reason": "watch",
        "meanStability": 5.65456164949561,
        "medianSecondsPerItem": 5.001961676031227,
        "attempts": 138,
        "weightedSample": 108.33333333333326,
        "lastAttemptAt": "2026-10-15T04:20:09.895Z"
      },
      {
        "skill": "reading",
        "focus": "grammar",
        "successRateEwma": 0.9648156279111679,
        "reason": "watch",
        "meanStability": 3.216293523782717,
        "medianSecondsPerItem": 4.402147348769451,
        "attempts": 17,
        "weightedSample": 17,
        "lastAttemptAt": "2026-10-05T11:23:18.484Z"
      },
      {
        "skill": "written",
        "focus": "vocabulary",
        "successRateEwma": 0.9877101856188824,
        "reason": "watch",
        "meanStability": 6.236807999854592,
        "medianSecondsPerItem": 5.050910998634983,
        "attempts": 76,
        "weightedSample": 71.66666666666663,
        "lastAttemptAt": "2026-10-15T04:20:09.895Z"
      },
      {
        "skill": "written",
        "focus": "grammar",
        "successRateEwma": 1,
        "reason": "watch",
        "meanStability": 7.406325054400002,
        "medianSecondsPerItem": 88.19503524591572,
        "attempts": 22,
        "weightedSample": 22,
        "lastAttemptAt": "2026-09-12T11:48:47.980Z"
      },
      {
        "skill": "written",
        "focus": "grammar",
        "successRateEwma": 1,
        "reason": "watch",
        "meanStability": 3.5007099139999998,
        "medianSecondsPerItem": 3.8333333333333335,
        "attempts": 15,
        "weightedSample": 15,
        "lastAttemptAt": "2026-10-05T11:23:18.484Z"
      },
      {
        "skill": "written",
        "focus": "vocabulary",
        "successRateEwma": 1,
        "reason": "watch",
        "meanStability": 39.48042902290529,
        "medianSecondsPerItem": 94.12563109887999,
        "attempts": 12,
        "weightedSample": 12,
        "lastAttemptAt": "2026-09-12T11:48:48.376Z"
      },
      {
        "skill": "written",
        "focus": "unknown",
        "successRateEwma": 1,
        "reason": "watch",
        "meanStability": 65.58713470240319,
        "medianSecondsPerItem": 19.759999999999998,
        "attempts": 8,
        "weightedSample": 8,
        "lastAttemptAt": "2026-10-22T04:36:14.335Z"
      }
    ],
    "insufficient": [
      {
        "skill": "written",
        "focus": "unknown",
        "status": "insufficient_data",
        "attempts": 1,
        "weightedSample": 1,
        "shortfall": 7
      },
      {
        "skill": "written",
        "focus": "grammar",
        "status": "insufficient_data",
        "attempts": 1,
        "weightedSample": 1,
        "shortfall": 7
      },
      {
        "skill": "reading",
        "focus": "vocabulary",
        "status": "insufficient_data",
        "attempts": 2,
        "weightedSample": 1.3333333333333333,
        "shortfall": 6.666666666666667
      },
      {
        "skill": "listening",
        "focus": "phonology",
        "status": "insufficient_data",
        "attempts": 2,
        "weightedSample": 2,
        "shortfall": 6
      },
      {
        "skill": "listening",
        "focus": "pronunciation",
        "status": "insufficient_data",
        "attempts": 3,
        "weightedSample": 2.6666666666666665,
        "shortfall": 5.333333333333334
      },
      {
        "skill": "spoken",
        "focus": "pronunciation",
        "status": "insufficient_data",
        "attempts": 3,
        "weightedSample": 2.6666666666666665,
        "shortfall": 5.333333333333334
      },
      {
        "skill": "reading",
        "focus": "unknown",
        "status": "insufficient_data",
        "attempts": 6,
        "weightedSample": 3.9999999999999996,
        "shortfall": 4
      },
      {
        "skill": "reading",
        "focus": "vocabulary",
        "status": "insufficient_data",
        "attempts": 6,
        "weightedSample": 5,
        "shortfall": 3
      },
      {
        "skill": "listening",
        "focus": "phonology",
        "status": "insufficient_data",
        "attempts": 5,
        "weightedSample": 5,
        "shortfall": 3
      },
      {
        "skill": "written",
        "focus": "unknown",
        "status": "insufficient_data",
        "attempts": 6,
        "weightedSample": 6,
        "shortfall": 2
      },
      {
        "skill": "reading",
        "focus": "unknown",
        "status": "insufficient_data",
        "attempts": 11,
        "weightedSample": 7.333333333333334,
        "shortfall": 0.6666666666666661
      }
    ]
  }
};
