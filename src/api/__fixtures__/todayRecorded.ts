/*
 * Answers recorded 2026-10-24 on the dev stack for student@email.com (school Nordick) —
 * group member lists cut to one. The schools, scheduling and subscription ports are tested
 * against these, so a test fails where the real contract would.
 */

export const recorded = {
  "schools": [
    {
      "id": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
      "name": "Nordick",
      "slug": "nordick",
      "ownerId": "0b2f2404-854a-4ea5-9d33-816db353983f",
      "memberCount": 12,
      "createdAt": "2026-05-31T17:07:23.252Z",
      "myRole": "STUDENT",
      "myCapabilities": []
    }
  ],
  "membership": {
    "id": "86729e53-72c9-40eb-8bdc-15b31b902da9",
    "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
    "studentId": "182558cf-f90b-464f-84a4-5a68610b7f94",
    "status": "onboarding",
    "source": "public-apply",
    "selfReportedLevel": "B1",
    "createdAt": "2026-06-24T16:46:01.400Z",
    "updatedAt": "2026-06-24T16:46:28.465Z"
  },
  "placements": [
    {
      "id": "e65dc2a6-bb8d-4a47-9bcd-c3c89d28f1d1",
      "groupId": "52d1e710-9f94-4b75-90eb-1390b35481ac",
      "groupName": "NO-B1-2026",
      "lang": "nb",
      "level": "B1",
      "role": "student",
      "status": "active",
      "addedAt": "2026-07-19T00:09:03.465Z",
      "exitedAt": null,
      "teachers": [
        {
          "userId": "4db6c684-95cc-4637-b4da-92e8068eebaf",
          "name": "teacher4",
          "avatarUrl": null,
          "role": "primary"
        }
      ],
      "schedule": [],
      "groupStatus": "active"
    },
    {
      "id": "d2932451-4e61-497a-9f8e-1086327d1fc9",
      "groupId": "479830e3-dc65-4d6f-8557-e2ea73667628",
      "groupName": "NO-A2-2026",
      "lang": "nb",
      "level": "A2",
      "role": "student",
      "status": "active",
      "addedAt": "2026-07-13T12:27:07.157Z",
      "exitedAt": null,
      "teachers": [
        {
          "userId": "679226f7-b302-4c4a-a866-ebd90fb53304",
          "name": "teacher3",
          "avatarUrl": null,
          "role": "primary"
        },
        {
          "userId": "4cb6f207-aeb4-4be5-bd4d-fded82ef94a1",
          "name": "Barmaley",
          "avatarUrl": null,
          "role": "co_primary"
        }
      ],
      "schedule": [],
      "groupStatus": "active"
    },
    {
      "id": "ced03dba-104e-400d-99b7-3665eca99ab6",
      "groupId": "5a3a4222-3fe4-4ccb-9faf-8d98f308aaaf",
      "groupName": "Norwigian -2028",
      "lang": "nb",
      "level": "B1",
      "role": "student",
      "status": "active",
      "addedAt": "2026-06-24T06:38:48.158Z",
      "exitedAt": null,
      "teachers": [
        {
          "userId": "679226f7-b302-4c4a-a866-ebd90fb53304",
          "name": "teacher3",
          "avatarUrl": null,
          "role": "primary"
        },
        {
          "userId": "4cb6f207-aeb4-4be5-bd4d-fded82ef94a1",
          "name": "Barmaley",
          "avatarUrl": null,
          "role": "co_primary"
        },
        {
          "userId": "4642ccc8-2273-4835-afc7-f23378f7de5e",
          "name": "teacher103",
          "avatarUrl": null,
          "role": "substitute"
        }
      ],
      "schedule": [],
      "groupStatus": "active"
    }
  ],
  "groups": {
    "52d1e710-9f94-4b75-90eb-1390b35481ac": {
      "id": "52d1e710-9f94-4b75-90eb-1390b35481ac",
      "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
      "name": "NO-B1-2026",
      "description": null,
      "status": "active",
      "mode": "online",
      "courseId": "64cb0a41-18af-5799-9c7a-622ee0d381cd",
      "lang": "nb",
      "level": "B1",
      "ageBand": null,
      "capacityMin": null,
      "capacityMax": 12,
      "startDate": null,
      "endDate": null,
      "studentCount": 6,
      "isDefault": false,
      "members": [
        {
          "id": "cf7de1f4-902e-4363-9450-e67bdc0a807f",
          "userId": "dece21de-5939-4a9a-ab54-492319a031e7",
          "addedAt": "2026-07-19T00:09:03.411Z"
        }
      ],
      "teachers": [
        {
          "id": "97f4eb9d-9585-4364-8e9b-db5d6d844cc0",
          "userId": "4db6c684-95cc-4637-b4da-92e8068eebaf",
          "role": "primary",
          "fromDate": null,
          "toDate": null,
          "reason": null
        }
      ],
      "materials": [],
      "createdAt": "2026-07-19T00:09:03.189Z",
      "updatedAt": "2026-07-19T07:20:42.487Z"
    },
    "479830e3-dc65-4d6f-8557-e2ea73667628": {
      "id": "479830e3-dc65-4d6f-8557-e2ea73667628",
      "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
      "name": "NO-A2-2026",
      "description": null,
      "status": "active",
      "mode": "online",
      "courseId": "82c35711-f042-5c27-9fe1-174bedee7911",
      "lang": "nb",
      "level": "A2",
      "ageBand": null,
      "capacityMin": 5,
      "capacityMax": 12,
      "startDate": "2026-07-13T00:00:00.000Z",
      "endDate": "2026-12-30T00:00:00.000Z",
      "studentCount": 6,
      "isDefault": false,
      "members": [
        {
          "id": "cca99fe3-6e45-4c54-b998-12ea5b112028",
          "userId": "b8e3f1f2-198f-45c1-815b-01b0ed47e04b",
          "addedAt": "2026-07-13T12:26:47.434Z"
        }
      ],
      "teachers": [
        {
          "id": "8a326033-2f7d-41af-9542-62274b8ddfc6",
          "userId": "679226f7-b302-4c4a-a866-ebd90fb53304",
          "role": "primary",
          "fromDate": null,
          "toDate": null,
          "reason": null
        },
        {
          "id": "c80ee63d-5a95-4164-8c7f-27e6643dc495",
          "userId": "4cb6f207-aeb4-4be5-bd4d-fded82ef94a1",
          "role": "co_primary",
          "fromDate": null,
          "toDate": null,
          "reason": null
        }
      ],
      "materials": [
        {
          "id": "42b0b83c-2a7f-4a2e-b5b9-f04a3912be3b",
          "courseId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
          "addedAt": "2026-07-13T13:20:52.603Z"
        }
      ],
      "createdAt": "2026-07-13T12:26:47.208Z",
      "updatedAt": "2026-07-17T10:30:27.429Z"
    },
    "5a3a4222-3fe4-4ccb-9faf-8d98f308aaaf": {
      "id": "5a3a4222-3fe4-4ccb-9faf-8d98f308aaaf",
      "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
      "name": "Norwigian -2028",
      "description": null,
      "status": "active",
      "mode": "online",
      "courseId": "a5fef679-04ad-5307-85ab-14d7e527cc37",
      "lang": "nb",
      "level": "B1",
      "ageBand": null,
      "capacityMin": 1,
      "capacityMax": 20,
      "startDate": "2026-06-25T00:00:00.000Z",
      "endDate": "2027-06-02T00:00:00.000Z",
      "studentCount": 5,
      "isDefault": false,
      "members": [
        {
          "id": "63fd4e97-874c-442f-a80a-9e83df9b2593",
          "userId": "b8e3f1f2-198f-45c1-815b-01b0ed47e04b",
          "addedAt": "2026-06-20T18:25:53.825Z"
        }
      ],
      "teachers": [
        {
          "id": "5cb3f077-2145-47a3-8e17-33ec121af700",
          "userId": "679226f7-b302-4c4a-a866-ebd90fb53304",
          "role": "primary",
          "fromDate": null,
          "toDate": null,
          "reason": null
        },
        {
          "id": "ecbbb4c3-7b93-405c-b14d-c6a0e2233360",
          "userId": "4cb6f207-aeb4-4be5-bd4d-fded82ef94a1",
          "role": "co_primary",
          "fromDate": null,
          "toDate": null,
          "reason": null
        },
        {
          "id": "90a807c8-b7f9-453e-92d9-b966d34b33c7",
          "userId": "4642ccc8-2273-4835-afc7-f23378f7de5e",
          "role": "substitute",
          "fromDate": "2026-06-23T00:00:00.000Z",
          "toDate": "2026-06-25T00:00:00.000Z",
          "reason": "sick"
        }
      ],
      "materials": [],
      "createdAt": "2026-06-17T07:35:57.066Z",
      "updatedAt": "2026-09-05T07:42:10.003Z"
    }
  },
  "nextLessons": {
    "52d1e710-9f94-4b75-90eb-1390b35481ac": [],
    "479830e3-dc65-4d6f-8557-e2ea73667628": [
      {
        "id": "5b1bd620-b829-4558-9270-57b597d59ab3",
        "groupId": "479830e3-dc65-4d6f-8557-e2ea73667628",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "slotId": "05e49a7a-8e02-43e4-a98a-39b1c3a9b0e4",
        "date": "2026-10-26",
        "startTime": "00:00",
        "endTime": "13:45",
        "teacherId": "679226f7-b302-4c4a-a866-ebd90fb53304",
        "room": null,
        "status": "scheduled",
        "curriculumUnitId": null
      }
    ],
    "5a3a4222-3fe4-4ccb-9faf-8d98f308aaaf": [
      {
        "id": "952c2a4b-62b3-4e76-bdfb-8164d1972b46",
        "groupId": "5a3a4222-3fe4-4ccb-9faf-8d98f308aaaf",
        "schoolId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8",
        "slotId": "84b1bc38-3d00-41e5-ac7f-119a76e765e4",
        "date": "2026-10-26",
        "startTime": "09:00",
        "endTime": "11:30",
        "teacherId": "679226f7-b302-4c4a-a866-ebd90fb53304",
        "room": null,
        "status": "scheduled",
        "curriculumUnitId": null
      }
    ]
  },
  "entitlementsSelf": {
    "account": {
      "type": "user",
      "externalId": "182558cf-f90b-464f-84a4-5a68610b7f94"
    },
    "source": "free_plan",
    "plan": {
      "code": "free_individual",
      "name": "Free",
      "version": 1
    },
    "subscription": null,
    "features": {
      "ai.practice": {
        "enabled": true,
        "monthlyCredits": "20",
        "limits": {}
      },
      "ai.review_direct": {
        "enabled": false,
        "monthlyCredits": null,
        "limits": {}
      },
      "ai.student_assist": {
        "enabled": true,
        "monthlyCredits": "20",
        "limits": {}
      }
    },
    "periodStart": "2026-10-01T00:00:00.000Z",
    "periodEnd": "2026-11-01T00:00:00.000Z",
    "validUntil": "2026-11-01T00:00:00.000Z",
    "version": 0
  },
  "entitlementsSchool": {
    "account": {
      "type": "workspace",
      "externalId": "f3ced490-5f8b-4d04-bd05-45ab1a101ff8"
    },
    "source": "free_plan",
    "plan": {
      "code": "free_workspace",
      "name": "Free workspace",
      "version": 1
    },
    "subscription": null,
    "features": {
      "ai.authoring": {
        "enabled": true,
        "monthlyCredits": "50",
        "limits": {}
      },
      "ai.practice": {
        "enabled": false,
        "monthlyCredits": null,
        "limits": {}
      },
      "ai.review_draft": {
        "enabled": true,
        "monthlyCredits": "50",
        "limits": {}
      },
      "ai.student_assist": {
        "enabled": false,
        "monthlyCredits": null,
        "limits": {}
      }
    },
    "periodStart": "2026-10-01T00:00:00.000Z",
    "periodEnd": "2026-11-01T00:00:00.000Z",
    "validUntil": "2026-11-01T00:00:00.000Z",
    "version": 0
  },
  "containerTitles": {
    "a5fef679-04ad-5307-85ab-14d7e527cc37": "Norsk B1 — Stein på stein",
    "64cb0a41-18af-5799-9c7a-622ee0d381cd": "Norsk B1",
    "82c35711-f042-5c27-9fe1-174bedee7911": "Ny i Norge — A2"
  }
} as const;
