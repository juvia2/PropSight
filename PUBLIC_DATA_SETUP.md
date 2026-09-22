# 공공자료 API 설정

## 직접 입력할 파일

프로젝트의 backend/.env를 편집하세요. backend/.env.example에는 같은 빈 설정 양식이 있습니다.
기존 .env가 있으면 자동으로 덮어쓰지 않습니다. 파일에 아래 항목이 없으면 추가하세요.

    VWORLD_API_KEY=
    VWORLD_DOMAIN=http://localhost:5173
    BUILDING_PERMIT_API_KEY=
    HOUSING_PERMIT_API_KEY=
    BUILDING_REGISTER_API_KEY=

키 값은 이번 작업에서 입력하지 않았습니다. .env는 Git 제외 대상이며 브라우저로 전달하지 않습니다.
backend/.env는 백엔드 시작 시 자동 로딩됩니다. 운영 환경에 이미 지정된 환경변수가 우선합니다.
키 입력 뒤에는 실행 중인 백엔드를 종료하고 다시 실행하세요. .env 변경만으로는 자동 재시작되지 않습니다.

    cd /Users/ju/Documents/PropSight/backend
    uv run uvicorn main:app --reload --port 8000

프론트엔드에 공공 API 키를 넣거나 VITE_ 이름으로 만들지 마세요.

## 서비스별 신청과 범위

| 설정 항목 | 신청 서비스 / 구현 범위 |
| --- | --- |
| VWORLD_API_KEY | 브이월드 국가중점 API의 토지이용계획속성조회 |
| VWORLD_DOMAIN | 브이월드 인증키에 등록한 서비스 URL과 동일하게 입력 |
| BUILDING_PERMIT_API_KEY | 건축HUB 건축인허가정보 / 기본개요 |
| HOUSING_PERMIT_API_KEY | 건축HUB 주택인허가정보 / 기본개요 |
| BUILDING_REGISTER_API_KEY | 건축HUB 건축물대장정보 / 표제부 |

공공데이터포털 키는 세 건축HUB 서비스의 활용 승인이 각각 필요합니다.
같은 계정의 공통 인증키라면 승인된 서비스에 같은 키를 입력할 수 있습니다.
일반 인증키(Decoding)를 권장하며 Encoding 키도 서버에서 한 번 디코딩하여 처리합니다.
브이월드 키는 별도 발급 키이며 위의 건축HUB 키와 서로 대체할 수 없습니다.

공식 신청·명세:
- 토지이용계획: https://www.vworld.kr/dtna/dtna_apiSvcFc_s001.do?apiNum=51
- 건축인허가: https://www.data.go.kr/data/15136267/openapi.do
- 주택인허가: https://www.data.go.kr/data/15136560/openapi.do
- 건축물대장: https://www.data.go.kr/data/15134735/openapi.do

토지이용계획은 용도지역·지구·저촉 여부 등 공개 속성정보 조회입니다. 관공서 발급 확인서 PDF 원본이나 전체 법률 해석을 생성하지 않습니다.
층별개요·호별개요 등 추가 하위 API는 이번 범위에 포함하지 않았습니다.

## 사용

1. 로그인 후 저장된 장소나 구역을 엽니다.
2. 건물 · 토지 공공자료를 펼칩니다.
3. 핀 위치의 지번 찾기, 지번 주소 검색, 또는 19자리 PNU 직접 입력으로 필지를 지정합니다.
4. 표시된 지번이 맞는지 확인하고 원하는 서비스의 조회·저장을 누릅니다.
5. 자료 제목을 펼쳐 한글 항목명, 출처, 조회 시각과 조회자를 확인합니다.

조회할 때만 외부 API를 호출합니다. 팝업을 다시 열 때는 저장 자료를 DB에서 가져옵니다.
여러 건물이 있는 필지는 여러 결과가 표시됩니다. 반환된 원본 필드를 보관하며 제공되지 않은 항목을 추정하여 채우지 않습니다.
조회 결과 없음과 인증·통신 실패를 구분합니다. 실패 시 이전 저장 자료를 유지합니다.
각 서비스 최대 10페이지/1,000건까지 저장하고 일부 결과일 경우 전체 건수와 함께 표시합니다.
도로명·대표 지번 검색으로 모든 부속필지나 동일 사업의 모든 기록이 자동 합쳐지는 것은 아닙니다.

## 서버 API

- GET /api/public-data/services: 서비스 이름, 설정 여부, 출처만 반환 (키 비공개)
- GET /api/{properties|commercial_blocks}/{id}/public-data: 저장 자료
- POST /api/{properties|commercial_blocks}/{id}/public-data/{kind}: 조회 후 저장
- kind: land_use, building_permit, housing_permit, building_register
- 본문: {"pnu":"1165010800113320002","address":"선택한 지번 주소"}

외부 URL은 서버에 고정되어 있고 요청에서 임의 URL을 받지 않습니다.
데이터는 PostgreSQL public_data_snapshots 테이블에 저장됩니다.
인증키 누락은 503, 기관 연결·응답 오류는 502, 시간 초과는 504로 반환합니다.
API 키·외부 오류 원문은 클라이언트와 DB 응답에 포함하지 않습니다.

## 검증 범위

모의 기관 응답으로 네 API의 요청 변환, JSON/XML 파싱, 페이지 처리, 키 오류, DB 저장·갱신과 실패 보존을 검증했습니다.
브라우저에서는 주소/산 지번/PNU 처리, 저장 결과, 한글 항목명, 미설정 안내와 모바일 배치를 검증했습니다.
실제 인증키로 기관 데이터와 대조하는 검증은 키 입력 및 서비스 승인 완료 후 필요합니다。

## 핀 없이 조회

상단의 공공자료 조회 버튼에서 지번 주소 또는 PNU로 네 자료를 조회할 수 있습니다. 로그인은 필요하며, 이 화면의 결과는 DB에 저장하지 않습니다. 창을 닫으면 결과가 사라집니다. 기록에 보관하려면 저장된 핀·구역의 조회·저장을 사용하세요.

- POST /api/public-data/lookup/{kind}: 주소에 해당하는 공공자료를 조회하여 반환 (저장 없음)
- 핀 위치의 지번 찾기는 주소 입력란까지 자동으로 채웁니다. 주소 입력을 수정하면 이전 필지 선택을 해제하여 잘못된 지번 조회를 방지합니다.
