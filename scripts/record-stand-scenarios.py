#!/usr/bin/env python3
"""
Record chains of attempt calls on the dev stand, for the local engine's parity test
(offline plan, B4-B5; `src/offline/engine/standScenarios.test.ts`).

For each scenario: drops the learner's open attempts at the exercise, starts a fresh practice
attempt, makes every call in order (pausing `delayMs` first where given), and appends the
scenario to the fixture with the exercise's key (`/answers`), its student projection
(`/display`) and every reply the engine gave. A scenario already in the fixture is skipped.

    python3 scripts/record-stand-scenarios.py scenarios.json [learner-email]

A scenario: {"name", "templateCode", "exerciseId", "ops": [{"op": "submit"|"answer"|
"checkRow"|"reveal"|"selfCheck"|"draft", "body"?, "draftAnswer"?, "delayMs"?}]}.
Boards left open (`inflection_table`, `information_transfer`) are resumed by the next start,
so record those on a learner with no attempt at the exercise, and close the board in the chain.
Dev accounts share the password below (stand only).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get('STAND', 'http://localhost')
AUTH = os.environ.get('STAND_AUTH', 'http://localhost:5062')
FIXTURE = os.path.join(os.path.dirname(__file__), '..', 'src', 'offline', 'engine',
                       '__fixtures__', 'stand-scenarios.json')
PATHS = {'submit': 'submit', 'answer': 'answers', 'checkRow': 'rows', 'reveal': 'reveal',
         'selfCheck': 'self-check', 'items': 'items'}


def login(email):
    req = urllib.request.Request(f'{AUTH}/api/v1/auth/login',
                                 data=json.dumps({'email': email, 'password': '!Password1234'}).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())['accessToken']


def main():
    scenarios = json.load(open(sys.argv[1]))
    token = login(sys.argv[2] if len(sys.argv) > 2 else 'student20@email.com')

    def call(method, url, body=None):
        req = urllib.request.Request(BASE + url, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Authorization': 'Bearer ' + token,
                                              'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            return e.code, (json.loads(raw) if raw else None)

    fixture = json.load(open(FIXTURE)) if os.path.exists(FIXTURE) else []
    names = {s['name'] for s in fixture}
    for sc in scenarios:
        if sc['name'] in names:
            print('skip', sc['name'])
            continue
        ex = sc['exerciseId']
        _, key = call('GET', f'/api/v1/exercises/{ex}/answers')
        _, display = call('GET', f'/api/v1/exercises/{ex}/display')
        _, page = call('GET', f'/api/v1/exercises/{ex}/attempts?status=IN_PROGRESS&limit=20')
        for a in (page or {}).get('items', []):
            call('DELETE', f"/api/v1/exercises/{ex}/attempts/{a['id']}")
        # `startBody` adds to the start — a `minimal_pairs` sitting brings the draw it was dealt.
        status, start = call('POST', f'/api/v1/exercises/{ex}/attempts',
                             {'language': 'nb', 'mode': 'PRACTICE', **sc.get('startBody', {})})
        if status >= 300:
            print('start refused', sc['name'], status, start)
            continue
        aid = start['attemptId']
        replies = []
        for op in sc['ops']:
            if op.get('delayMs'):
                time.sleep(op['delayMs'] / 1000)
            kind = op['op']
            path = f'/api/v1/exercises/{ex}/attempts/{aid}'
            if kind == 'draft':
                status, body = call('PUT', f'{path}/draft', {'draftAnswer': op['draftAnswer']})
            elif kind == 'selfCheck':
                status, body = call('POST', f'{path}/self-check', {'draftAnswer': op['draftAnswer']})
            elif kind in ('reveal', 'items'):
                status, body = call('POST', f'{path}/{PATHS[kind]}', {})
            else:
                status, body = call('POST', f'{path}/{PATHS[kind]}', op['body'])
            replies.append({'status': status,
                            'body': body if status < 300 else {'message': (body or {}).get('message')}})
            print(f"  {sc['name'][:40]} #{len(replies) - 1}: {status} {json.dumps(body, ensure_ascii=False)[:160]}")
        fixture.append({
            'name': sc['name'], 'templateCode': sc['templateCode'],
            'key': {k: key.get(k) for k in ('templateCode', 'content', 'expectedAnswers',
                                             'answerCheckSettings', 'instructions')},
            'projection': (display or {}).get('content', {}),
            'ops': sc['ops'], 'responses': replies,
            **({'seed': sc['seed'], 'startBody': sc['startBody']} if 'startBody' in sc else {}),
        })
    json.dump(fixture, open(FIXTURE, 'w'), ensure_ascii=False, indent=1)
    print(len(fixture), 'scenarios in the fixture')


if __name__ == '__main__':
    main()
