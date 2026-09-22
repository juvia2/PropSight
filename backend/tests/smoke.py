"""Running API + PostGIS integration test; only deletes records it creates."""
import json
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor
from http.cookiejar import CookieJar
from uuid import uuid4
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import delete
from database import SessionLocal
from models import User, Team, LoginSession
from urllib.error import HTTPError
from urllib.parse import urlencode

BASE = 'http://127.0.0.1:8000'
created = []
accounts = []
team_ids = []
opener = build_opener(HTTPCookieProcessor(CookieJar()))
other = build_opener(HTTPCookieProcessor(CookieJar()))
anonymous = build_opener()
suffix = uuid4().hex[:10]

def call(path, method='GET', payload=None, expected=200, headers=None, client=None):
    req = Request(BASE + path, data=json.dumps(payload).encode() if payload is not None else None,
                  method=method, headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        response = (client or opener).open(req)
    except HTTPError as error:
        response = error
    assert response.status == expected, (path, response.status, response.read().decode())
    data = response.read()
    return json.loads(data) if data else None

try:
    assert call('/health')['status'] == 'ok'
    call('/api/properties', expected=401, client=anonymous)
    first = call('/api/auth/register', 'POST', {'username': 'test_' + suffix, 'password': 'test-password-123', 'display_name': '검증 작성자', 'team_name': '검증 팀 ' + suffix}, 201)
    accounts.append(first['user']['id']); team_ids.append(first['user']['team_id'])
    second = call('/api/auth/register', 'POST', {'username': 'other_' + suffix, 'password': 'test-password-456', 'display_name': '검증 동료', 'invite_code': first['invite_code']}, 201, client=other)
    accounts.append(second['user']['id'])
    assert second['user']['team_id'] == first['user']['team_id']
    call('/api/team/invite', 'POST', expected=403, client=other)
    assert call('/api/auth/me')['id'] == first['user']['id']
    call('/api/auth/login', 'POST', {'username': 'test_' + suffix, 'password': 'incorrect-password'}, 401)
    call('/api/auth/logout', 'POST', expected=403, headers={'Origin': 'https://untrusted.example'})
    for resource, geometry in [('properties', {'type': 'Point', 'coordinates': [127.0559, 37.5446]}),
        ('commercial_blocks', {'type': 'Polygon', 'coordinates': [[[127.05, 37.54], [127.06, 37.54], [127.06, 37.55], [127.05, 37.54]]]})]:
        for category in ['개발계획', '상권분석', '진행매물']:
            payload = {'name': 'SMOKE 임시 검증', 'memo': '검증 후 삭제', 'category': category, 'geometry': geometry}
            item = call(f'/api/{resource}', 'POST', payload, 201)
            path = f'/api/{resource}/{item["id"]}'
            created.append(path)
            assert item['properties']['created_at']
            created_at = item['properties']['created_at']
            assert item['properties']['created_by'] == first['user']['id']
            assert item['properties']['team_id'] == first['user']['team_id']
            revision_path = path + '/revisions'
            call(revision_path, expected=401, client=anonymous)
            first_revisions = call(revision_path)
            assert len(first_revisions) == 1
            assert first_revisions[0]['memo'] == payload['memo']
            assert first_revisions[0]['author_username'] == 'test_' + suffix
            assert first_revisions[0]['saved_at']
            assert len(call(revision_path, client=other)) == 1
            call(path, 'PUT', payload, 403, client=other)
            call(path, 'DELETE', expected=403, client=other)
            call(f'/api/{resource}', 'POST', {**payload, 'created_by': second['user']['id']}, 422)
            scoped = call(f'/api/{resource}?' + urlencode({'team_id': first['user']['team_id'], 'created_by': first['user']['id']}))
            assert any(x['id'] == item['id'] for x in scoped['features'])
            assert not call(f'/api/{resource}?created_by={second["user"]["id"]}')['features']
            assert item['type'] == 'Feature' and item['properties']['category'] == category
            assert item['geometry'] == geometry
            assert call(path)['id'] == item['id']
            collection = call(f'/api/{resource}?' + urlencode({'category': category}))
            assert all(x['properties']['category'] == category for x in collection['features'])
            assert any(x['id'] == item['id'] for x in collection['features'])
            updated = call(path, 'PUT', {**payload, 'category': '진행매물', 'name': '수정 검증', 'memo': '두 번째 메모'})
            assert updated['properties']['name'] == '수정 검증'
            assert updated['properties']['created_at'] == created_at
            assert updated['properties']['category'] == '진행매물'
            revisions = call(revision_path)
            assert len(revisions) == 2
            assert revisions[0]['memo'] == '두 번째 메모'
            assert revisions[0]['author_id'] == first['user']['id']
            assert revisions[1]['memo'] == '검증 후 삭제'
            call(path, 'DELETE', expected=204); created.remove(path)
            call(revision_path, expected=404)
            call(path, expected=404)
        call(f'/api/{resource}', 'POST', {**payload, 'category': 'invalid'}, 422)
        call(f'/api/{resource}', 'POST', {**payload, 'name': '  '}, 422)
    call('/api/properties', 'POST', {**payload, 'geometry': {'type': 'Point', 'coordinates': [181, 0]}}, 422)
    call('/api/properties', 'POST', payload, 422)
    call('/api/commercial_blocks', 'POST', {**payload, 'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]]}}, 422)
    call('/api/commercial_blocks', 'POST', {**payload, 'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 1], [0, 1], [1, 0]]]}}, 422)
    req = Request(BASE + '/api/properties', method='OPTIONS', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST'})
    with urlopen(req) as response:
        assert response.headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'
    with urlopen('http://localhost:5173') as response:
        assert b'<div id="root"></div>' in response.read()
    call('/api/auth/logout', 'POST', expected=204)
    call('/api/properties', expected=401)
    call('/api/auth/login', 'POST', {'username': 'test_' + suffix, 'password': 'test-password-123'})
    print('PASS: memo revision history, login, team invitations, author attribution, filters, ownership, session invalidation, both geometry types, all categories, GeoJSON roundtrip, CRUD, validation, CORS, frontend HTTP')
finally:
    for path in created:
        call(path, 'DELETE', expected=204)

    with SessionLocal() as db:
        db.execute(delete(LoginSession).where(LoginSession.user_id.in_(accounts)))
        db.execute(delete(User).where(User.id.in_(accounts)))
        db.execute(delete(Team).where(Team.id.in_(team_ids)))
        db.commit()
