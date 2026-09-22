"""Live API integration tests; creates and removes only its own test records."""
import base64
import json
from http.cookiejar import CookieJar
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
from uuid import uuid4
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import delete, select, func
from database import SessionLocal
from models import Attachment, Property, CommercialBlock, User, Team, LoginSession

BASE = 'http://127.0.0.1:8000'
owner = build_opener(HTTPCookieProcessor(CookieJar()))
other = build_opener(HTTPCookieProcessor(CookieJar()))
anon = build_opener()
accounts, teams, records = [], [], []
suffix = uuid4().hex[:10]

def call(path, method='GET', payload=None, client=owner, expected=200, raw=None, headers=None):
    data = raw if raw is not None else json.dumps(payload).encode() if payload is not None else None
    req = Request(BASE + path, data=data, method=method, headers=headers or {'Content-Type': 'application/json'})
    try:
        response = client.open(req)
    except HTTPError as error:
        response = error
    body = response.read()
    assert response.status == expected, (path, response.status, expected)
    return body, response.headers

def api(*args, **kwargs):
    body, _ = call(*args, **kwargs)
    return json.loads(body) if body else None

def upload(path, name, data, mime='application/octet-stream', **kwargs):
    boundary = 'propsight' + uuid4().hex
    raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + f'\r\n--{boundary}--\r\n'.encode())
    return api(path, 'POST', raw=raw, headers={'Content-Type': 'multipart/form-data; boundary=' + boundary}, **kwargs)

try:
    first = api('/api/auth/register', 'POST', {'username': 'files_' + suffix, 'password': 'test-password-123', 'display_name': '첨부 검증', 'team_name': '첨부 팀 ' + suffix}, expected=201)
    accounts.append(first['user']['id']); teams.append(first['user']['team_id'])
    second = api('/api/auth/register', 'POST', {'username': 'files2_' + suffix, 'password': 'test-password-123', 'display_name': '첨부 동료', 'invite_code': first['invite_code']}, client=other, expected=201)
    accounts.append(second['user']['id'])
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=')
    for resource, geometry in [('properties', {'type':'Point','coordinates':[127,37]}), ('commercial_blocks', {'type':'Polygon','coordinates':[[[127,37],[128,37],[128,38],[127,37]]]})]:
        payload = {'name':'첨부 검증', 'memo':'소유주 컨택중\n다음 주 방문', 'category':'진행매물', 'geometry':geometry}
        record = api('/api/' + resource, 'POST', payload, expected=201)
        records.append((resource, record['id']))
        path = f'/api/{resource}/{record["id"]}/attachments'
        api(path, client=anon, expected=401)
        upload(path, 'test.txt', b'test', client=other, expected=403)
        upload(path, 'empty.txt', b'', expected=422)
        upload(path, 'large.bin', b'x' * (10 * 1024 * 1024 + 1), expected=413)
        image = upload(path, '현장 사진.png', png, mime='image/png', expected=201)
        assert image['is_image'] and image['author_username'] == 'files_' + suffix
        url = path + '/' + str(image['id'])
        data, headers = call(url + '?preview=true')
        assert data == png and headers['Content-Type'] == 'image/png'
        assert headers['Content-Disposition'].startswith('inline')
        data, headers = call(url)
        assert data == png and headers['Content-Disposition'].startswith('attachment')
        call(url, client=anon, expected=401)
        call(url, client=other)
        call(url, 'DELETE', client=other, expected=403)
        call(f'/api/{resource}/99999999/attachments/{image["id"]}', expected=404)
        svg = upload(path, 'notes.svg', b'<svg onload="alert(1)"></svg>', mime='image/png', expected=201)
        assert not svg['is_image']
        _, headers = call(path + '/' + str(svg['id']) + '?preview=true')
        assert headers['Content-Disposition'].startswith('attachment')
        assert headers['Content-Type'] == 'application/octet-stream'
        for i in range(18):
            upload(path, f'note-{i}.txt', '관련 기록'.encode(), expected=201)
        upload(path, 'excess.txt', b'x', expected=422)
        files = api(path)
        assert len(files) == 20 and all('content' not in file for file in files)
        api(f'/api/{resource}/{record["id"]}', 'PUT', {**payload, 'memo':'소유주 연락 완료'})
        assert len(api(path)) == 20
        call(url, 'DELETE', expected=204)
        call(url, expected=404)
        call(f'/api/{resource}/{record["id"]}', 'DELETE', expected=204)
        with SessionLocal() as db:
            assert db.scalar(select(func.count()).select_from(Attachment).where(Attachment.resource == resource, Attachment.record_id == record['id'])) == 0
    print('PASS: image/file upload, byte-exact download, image preview, ownership/auth, unsafe inline type rejection, size/count limits, persistence after memo edit, deletion cleanup (both record types).')
finally:
    with SessionLocal() as db:
        for resource, record_id in records:
            db.execute(delete(Attachment).where(Attachment.resource == resource, Attachment.record_id == record_id))
            from models import MemoRevision
            db.execute(delete(MemoRevision).where(MemoRevision.resource == resource, MemoRevision.record_id == record_id))
            db.execute(delete(Property if resource == 'properties' else CommercialBlock).where((Property if resource == 'properties' else CommercialBlock).id == record_id))
        db.execute(delete(LoginSession).where(LoginSession.user_id.in_(accounts)))
        db.execute(delete(User).where(User.id.in_(accounts)))
        db.execute(delete(Team).where(Team.id.in_(teams)))
        db.commit()
