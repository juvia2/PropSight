"""Provider fixtures + API/DB integration. No real provider keys or external calls."""
import json
import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, func
from main import app
from database import SessionLocal
from models import User, Team, LoginSession, MemoRevision, Property, PublicDataSnapshot
import public_data as pd

PNU = '1165010800113320002'
KEY_ENV = {config['env']: 'fixture-key' for config in pd.SERVICES.values()}

def response_data(kind, rows, total=None):
    if kind == 'land_use':
        return {'landUses': {'field': rows, 'totalCount': str(len(rows) if total is None else total)}}
    return {'response': {'header': {'resultCode': '00', 'resultMsg': 'NORMAL SERVICE'},
                         'body': {'items': {'item': rows}, 'totalCount': len(rows) if total is None else total}}}

class ProviderTests(unittest.TestCase):
    def test_parameters(self):
        with patch.dict(os.environ, KEY_ENV):
            params = pd.request_params('building_register', PNU, 2)
            self.assertEqual((params['sigunguCd'], params['bjdongCd'], params['platGbCd'], params['bun'], params['ji']),
                             ('11650', '10800', '0', '1332', '0002'))
            self.assertEqual(pd.request_params('housing_permit', PNU[:10]+'2'+PNU[11:], 1)['platGbCd'], '1')
            self.assertEqual(pd.request_params('land_use', PNU, 1)['pnu'], PNU)
        with patch.dict(os.environ, {'BUILDING_REGISTER_API_KEY': 'a%2Bb%2Fc%3D'}):
            self.assertEqual(pd.request_params('building_register', PNU, 1)['serviceKey'], 'a+b/c=')

    def test_json_xml_empty_and_errors(self):
        for kind in pd.SERVICES:
            rows, total = pd.parse_response(json.dumps(response_data(kind, [{'pnu':PNU}])).encode(), kind)
            self.assertEqual(total, 1)
            self.assertEqual(rows[0]['pnu'], PNU)
            self.assertEqual(pd.parse_response(json.dumps(response_data(kind, [])).encode(), kind), ([],0))
        xml = b'<response><header><resultCode>00</resultCode></header><body><items><item><bldNm>A</bldNm></item></items><totalCount>1</totalCount></body></response>'
        self.assertEqual(pd.parse_response(xml, 'building_register')[0], [{'bldNm':'A'}])
        land = b'<landUses><field><pnu>123</pnu></field><totalCount>1</totalCount></landUses>'
        self.assertEqual(pd.parse_response(land, 'land_use')[0], [{'pnu':'123'}])
        for data in [b'<html>invalid</html>', b'{}', b'not json',
                     b'<!DOCTYPE x [<!ENTITY x "boom">]><x>&x;</x>',
                     b'<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
                     b'{"landUses":{"resultCode":"INVALID_KEY","resultMsg":"fixture-key"}}']:
            with self.assertRaises(HTTPException) as error:
                pd.parse_response(data, 'land_use')
            self.assertNotIn('fixture-key', error.exception.detail)

    def test_pagination_truncation_and_timeout(self):
        for kind in pd.SERVICES:
            pages = []
            def handler(request):
                page = int(request.url.params['pageNo'])
                pages.append(page)
                return httpx.Response(200, json=response_data(kind, [{'n':i} for i in range(100 if page == 1 else 1)], 101))
            with patch.dict(os.environ, KEY_ENV), httpx.Client(transport=httpx.MockTransport(handler)) as client:
                result = pd.fetch_data(kind, PNU, client=client)
                self.assertEqual(len(result['rows']), 101)
                self.assertEqual(pages, [1,2])
                self.assertFalse(result['truncated'])
        with patch.dict(os.environ, KEY_ENV), patch.object(pd, 'MAX_PAGES', 1), httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertTrue(pd.fetch_data(kind, PNU, client=client)['truncated'])
        def timeout(request):
            raise httpx.ReadTimeout('fixture-key', request=request)
        with patch.dict(os.environ, KEY_ENV), httpx.Client(transport=httpx.MockTransport(timeout)) as client:
            with self.assertRaises(HTTPException) as error:
                pd.fetch_data('land_use', PNU, client=client)
            self.assertEqual(error.exception.status_code, 504)
            self.assertNotIn('fixture-key', str(error.exception.detail))

    def test_missing_key_and_incomplete_page(self):
        with patch.dict(os.environ, {'VWORLD_API_KEY':''}):
            with self.assertRaises(HTTPException) as error:
                pd.request_params('land_use', PNU, 1)
            self.assertEqual(error.exception.status_code, 503)
        with self.assertRaises(HTTPException):
            pd.parse_response(json.dumps(response_data('building_permit',[],100)).encode(), 'building_permit')

class ApiTests(unittest.TestCase):
    def test_save_refresh_failed_refresh_and_ownership(self):
        accounts, teams, ids = [], [], []
        suffix = uuid4().hex[:10]
        try:
            with TestClient(app) as client, TestClient(app) as other:
                first = client.post('/api/auth/register', json={'username':'public_'+suffix,'password':'password-123','display_name':'공공자료 검증','team_name':'자료팀 '+suffix}).json()
                accounts.append(first['user']['id']);teams.append(first['user']['team_id'])
                second = other.post('/api/auth/register', json={'username':'other_'+suffix,'password':'password-123','display_name':'동료','invite_code':first['invite_code']}).json()
                accounts.append(second['user']['id'])
                created = client.post('/api/properties', json={'name':'API 테스트','memo':'원본','category':'진행매물','geometry':{'type':'Point','coordinates':[127,37]}})
                self.assertEqual(created.status_code,201)
                record_id=created.json()['id'];ids.append(record_id)
                path=f'/api/properties/{record_id}/public-data'
                with patch.dict(os.environ, {name:'' for name in KEY_ENV}):
                    self.assertTrue(all(not row['configured'] for row in client.get('/api/public-data/services').json()))
                    self.assertEqual(client.post(path+'/land_use',json={'pnu':PNU}).status_code,503)
                self.assertEqual(client.post(path+'/land_use',json={'pnu':'123'}).status_code,422)
                self.assertEqual(other.post(path+'/land_use',json={'pnu':PNU}).status_code,403)
                def handler(request):
                    kind=next(key for key,value in pd.SERVICES.items() if str(request.url).split('?')[0]==value['url'])
                    return httpx.Response(200,json=response_data(kind,[{'bldNm':'공공자료','pnu':PNU}]))
                original=pd.fetch_data
                with patch.dict(os.environ,KEY_ENV), httpx.Client(transport=httpx.MockTransport(handler)) as transport:
                    with patch.object(pd,'fetch_data',side_effect=lambda kind,pnu: original(kind,pnu,client=transport)):
                        for kind in pd.SERVICES:
                            result=client.post(path+'/'+kind,json={'pnu':PNU,'address':'조회한 지번'})
                            self.assertEqual(result.status_code,200,result.text)
                            self.assertNotIn('fixture-key',result.text)
                            self.assertEqual(result.json()['rows'][0]['bldNm'],'공공자료')
                        before=client.get(path).json()
                        for kind in pd.SERVICES:
                            lookup=client.post('/api/public-data/lookup/'+kind,json={'pnu':PNU})
                            self.assertEqual(lookup.status_code,200,lookup.text)
                            self.assertEqual(lookup.json()['kind'],kind)
                            self.assertNotIn('fixture-key',lookup.text)
                        self.assertEqual(client.get(path).json(),before)
                        self.assertEqual(client.post('/api/public-data/lookup/land_use',json={'pnu':'123'}).status_code,422)
                        self.assertEqual(client.post('/api/public-data/lookup/invalid',json={'pnu':PNU}).status_code,422)
                        initial=client.get(path).json()
                        self.assertEqual(len(initial),4)
                        client.post(path+'/land_use',json={'pnu':PNU,'address':'조회한 지번'})
                        self.assertEqual(len(client.get(path).json()),4)
                with patch.object(pd,'fetch_data',side_effect=HTTPException(502,'응답 오류')):
                    self.assertEqual(client.post(path+'/land_use',json={'pnu':PNU}).status_code,502)
                self.assertEqual(len(other.get(path).json()),4)
                self.assertEqual(client.delete(f'/api/properties/{record_id}').status_code,204)
                with SessionLocal() as db:
                    self.assertEqual(db.scalar(select(func.count()).select_from(PublicDataSnapshot).where(PublicDataSnapshot.record_id==record_id,PublicDataSnapshot.resource=='properties')),0)
                with TestClient(app) as anonymous:
                    self.assertEqual(anonymous.get('/api/public-data/services').status_code,401)
                    self.assertEqual(anonymous.post('/api/public-data/lookup/land_use',json={'pnu':PNU}).status_code,401)
        finally:
            with SessionLocal() as db:
                db.execute(delete(PublicDataSnapshot).where(PublicDataSnapshot.resource=='properties',PublicDataSnapshot.record_id.in_(ids)))
                db.execute(delete(MemoRevision).where(MemoRevision.resource=='properties',MemoRevision.record_id.in_(ids)))
                db.execute(delete(Property).where(Property.id.in_(ids)))
                db.execute(delete(LoginSession).where(LoginSession.user_id.in_(accounts)))
                db.execute(delete(User).where(User.id.in_(accounts)))
                db.execute(delete(Team).where(Team.id.in_(teams)))
                db.commit()

if __name__ == '__main__':
    unittest.main()
