"""Provider adapters. Credentials and upstream URLs never enter API responses."""
import json
import logging
import re
import os
import time
from pathlib import Path
from typing import Literal
from urllib.parse import unquote
import httpx
from defusedxml import ElementTree
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import get_db
from models import PublicDataSnapshot, User
from auth import CurrentUser

class CredentialFilter(logging.Filter):
    def filter(self, record):
        record.msg = re.sub(r'(?i)([?&](?:servicekey|key)=)[^&\s"<>]+', r'\1[REDACTED]', record.getMessage())
        record.args = ()
        return True

# HTTP client info logs must not reveal query-string credentials.
logging.getLogger('httpx').addFilter(CredentialFilter())

Kind = Literal['land_use', 'building_permit', 'housing_permit', 'building_register']
SERVICES = {
    'land_use': dict(label='토지이용계획', scope='용도지역·지구 및 저촉 정보', env='VWORLD_API_KEY',
        url='https://api.vworld.kr/ned/data/getLandUseAttr',
        source='https://www.vworld.kr/dtna/dtna_apiSvcFc_s001.do?apiNum=51'),
    'building_permit': dict(label='건축인허가', scope='기본개요', env='BUILDING_PERMIT_API_KEY',
        url='https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo',
        source='https://www.data.go.kr/data/15136267/openapi.do'),
    'housing_permit': dict(label='주택인허가', scope='기본개요', env='HOUSING_PERMIT_API_KEY',
        url='https://apis.data.go.kr/1613000/HsPmsHubService/getHpBasisOulnInfo',
        source='https://www.data.go.kr/data/15136560/openapi.do'),
    'building_register': dict(label='건축물대장', scope='표제부', env='BUILDING_REGISTER_API_KEY',
        url='https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo',
        source='https://www.data.go.kr/data/15134735/openapi.do'),
}
LABELS = json.loads(Path(__file__).with_name('public_data_labels.json').read_text())
PAGE_SIZE, MAX_PAGES, MAX_RESPONSE = 100, 10, 5 * 1024 * 1024
router = APIRouter()

class ParcelInput(BaseModel):
    pnu: str = Field(pattern=r'^[0-9]{10}[12][0-9]{8}$')
    address: str = Field(default='', max_length=300)
    model_config = {'extra': 'forbid'}

def key_for(kind):
    return os.getenv(SERVICES[kind]['env'], '').strip()

@router.get('/api/public-data/services')
def services(user: CurrentUser):
    return [{'kind': kind, 'label': config['label'], 'scope': config['scope'],
             'configured': bool(key_for(kind)), 'source': config['source']}
            for kind, config in SERVICES.items()]

def request_params(kind, pnu, page):
    key = key_for(kind)
    if not key:
        raise HTTPException(503, SERVICES[kind]['label'] + ' 인증키가 아직 설정되지 않았습니다.')
    if kind == 'land_use':
        return dict(key=key, domain=(os.getenv('VWORLD_DOMAIN') or os.getenv('RENDER_EXTERNAL_URL') or 'http://localhost:5173'),
                    pnu=pnu, format='json', numOfRows=PAGE_SIZE, pageNo=page)
    return dict(serviceKey=unquote(key), sigunguCd=pnu[:5], bjdongCd=pnu[5:10],
                platGbCd='0' if pnu[10] == '1' else '1', bun=pnu[11:15], ji=pnu[15:],
                _type='json', numOfRows=PAGE_SIZE, pageNo=page)

def provider_error(code):
    # Never expose upstream messages: they may echo request credentials.
    code = str(code).strip()
    if code in ('30', '31', '32', '33', '20', '21', 'INVALID_KEY', 'INCORRECT_KEY', 'UNAVAILABLE_KEY'):
        return HTTPException(502, '공공 API 인증 또는 이용 승인을 확인해 주세요. 브이월드는 등록 도메인도 확인해 주세요.')
    if code in ('OVER_REQUEST_LIMIT', 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR', '22', '05'):
        return HTTPException(502, '공공 API 호출 한도를 초과했거나 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.')
    return HTTPException(502, '공공 API가 조회를 처리하지 못했습니다. 인증 설정과 조회 지번을 확인해 주세요.')

def normalize_rows(items, total):
    if items in (None, ''):
        items = []
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list) or not all(isinstance(row, dict) for row in items):
        raise ValueError('invalid rows')
    count = int(total)
    if count < 0 or (count > 0 and not items):
        raise ValueError('incomplete response')
    # Keep only data fields, never request credentials or provider headers.
    return [{k: v for k, v in row.items() if k.lower() not in ('key', 'servicekey', 'apikey')} for row in items], count

def parse_response(content, kind):
    try:
        if content.lstrip().startswith(b'<'):
            root = ElementTree.fromstring(content)
            for node in root.iter():
                node.tag = node.tag.split('}')[-1]
            code = root.findtext('.//resultCode') or root.findtext('.//returnReasonCode')
            if code and code not in ('00', '0', 'NORMAL_SERVICE'):
                if code == '03':
                    return [], 0
                raise provider_error(code)
            if root.find('.//cmmMsgHeader') is not None:
                raise provider_error(code or 'error')
            total = root.findtext('.//totalCount')
            if total is None:
                raise ValueError('missing count')
            nodes = root.findall('.//field') if kind == 'land_use' else root.findall('.//items/item')
            return normalize_rows([{child.tag: child.text or '' for child in node} for node in nodes], total)
        data = json.loads(content)
        if kind == 'land_use':
            body = data['landUses']
            code = body.get('resultCode')
            if code and str(code) not in ('00', '0', 'NORMAL_SERVICE'):
                raise provider_error(code)
            return normalize_rows(body.get('field', []), body['totalCount'])
        response = data['response']
        code = str(response['header']['resultCode'])
        if code == '03':
            return [], 0
        if code not in ('00', '0'):
            raise provider_error(code)
        body = response['body']
        items = body.get('items') or {}
        return normalize_rows(items.get('item', []) if isinstance(items, dict) else items, body['totalCount'])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, '공공 API 응답 형식을 확인할 수 없습니다. 이전 저장 자료는 유지됩니다.') from None

def fetch_data(kind, pnu, client=None):
    config = SERVICES[kind]
    rows, total = [], 0
    started = time.monotonic()
    owned = client is None
    client = client or httpx.Client(timeout=12, follow_redirects=False)
    try:
        for page in range(1, MAX_PAGES + 1):
            params = request_params(kind, pnu, page)
            if time.monotonic() - started > 35:
                raise HTTPException(504, '공공 API 조회 시간이 초과되었습니다. 다시 시도해 주세요.')
            with client.stream('GET', config['url'], params=params) as response:
                if response.status_code != 200:
                    raise HTTPException(502, '공공 API 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.')
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_RESPONSE:
                        raise HTTPException(502, '공공 API 응답이 너무 큽니다. 조회 범위를 확인해 주세요.')
            batch, total = parse_response(bytes(content), kind)
            rows.extend(batch)
            if len(rows) >= total:
                break
        return {'rows': rows, 'total_count': total, 'truncated': len(rows) < total}
    except httpx.TimeoutException:
        raise HTTPException(504, '공공 API 응답이 지연되었습니다. 이전 저장 자료는 유지됩니다.') from None
    except httpx.HTTPError:
        raise HTTPException(502, '공공 API에 연결할 수 없습니다. 이전 저장 자료는 유지됩니다.') from None
    finally:
        if owned:
            client.close()

def serialize(db, row):
    user = db.get(User, row.fetched_by)
    return dict(id=row.id, kind=row.kind, pnu=row.pnu, address=row.address,
                fetched_at=row.fetched_at.isoformat(), author_username=user.username,
                source=SERVICES[row.kind]['source'], label=SERVICES[row.kind]['label'],
                field_labels=LABELS[row.kind], **row.payload)

@router.post('/api/public-data/lookup/{kind}')
def lookup(kind: Kind, payload: ParcelInput, user: CurrentUser):
    result = fetch_data(kind, payload.pnu)
    return dict(id=f'{kind}:{payload.pnu}', kind=kind, pnu=payload.pnu,
                address=payload.address, fetched_at=datetime.now(timezone.utc).isoformat(),
                author_username=user.username, source=SERVICES[kind]['source'],
                label=SERVICES[kind]['label'], field_labels=LABELS[kind], **result)


def register_public_data(app, resource, model):
    def record(db, item_id, user=None, lock=False):
        query = select(model).where(model.id == item_id)
        if lock:
            query = query.with_for_update()
        row = db.scalar(query)
        if row is None:
            raise HTTPException(404, '기록을 찾을 수 없습니다.')
        if user is not None and row.created_by != user.id:
            raise HTTPException(403, '작성자만 공공자료를 조회하여 저장할 수 있습니다.')
        return row

    @app.get(f'/api/{resource}/{{item_id}}/public-data', name=f'{resource}_public_data')
    def saved(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        record(db, item_id)
        rows = db.scalars(select(PublicDataSnapshot).where(
            PublicDataSnapshot.resource == resource, PublicDataSnapshot.record_id == item_id
        ).order_by(PublicDataSnapshot.fetched_at.desc()))
        return [serialize(db, row) for row in rows]

    @app.post(f'/api/{resource}/{{item_id}}/public-data/{{kind}}', name=f'{resource}_fetch_public_data')
    def refresh(item_id: int, kind: Kind, payload: ParcelInput, user: CurrentUser, db: Session = Depends(get_db)):
        record(db, item_id, user)
        result = fetch_data(kind, payload.pnu)
        # Serialize writes with record deletion and concurrent refreshes.
        record(db, item_id, user, lock=True)
        row = db.scalar(select(PublicDataSnapshot).where(
            PublicDataSnapshot.resource == resource, PublicDataSnapshot.record_id == item_id,
            PublicDataSnapshot.kind == kind, PublicDataSnapshot.pnu == payload.pnu))
        if row is None:
            row = PublicDataSnapshot(resource=resource, record_id=item_id, kind=kind, pnu=payload.pnu)
        row.address, row.payload = payload.address, result
        row.fetched_by, row.fetched_at = user.id, datetime.now(timezone.utc)
        db.add(row)
        db.commit()
        db.refresh(row)
        return serialize(db, row)
