# PropSight

상업용 부동산 임장 지도: React (Vite), FastAPI, PostgreSQL + PostGIS.

## 실행

프로젝트: `/Users/ju/Documents/PropSight`

```sh
# 루트: 기존 MySQL compose.yaml과 구분하기 위해 파일을 명시합니다.
colima start --cpu 2 --memory 4
docker-compose -f docker-compose.yml up -d

# 별도 터미널 1
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000

# 별도 터미널 2
cd frontend
npm install
npm run dev
```

- 대시보드: http://localhost:5173
- API 문서: http://localhost:8000/docs
- DB: 127.0.0.1:5432 / propsight / postgres / root
- 종료: 각 서버 터미널 Ctrl+C, `docker-compose -f docker-compose.yml down` (데이터 볼륨 유지)

## 카카오 키 설정

`frontend/.env.example`을 `frontend/.env.local`로 복사하고 `VITE_KAKAO_APP_KEY`에 카카오 JavaScript 앱 키를 입력하세요. 이 로컬 파일은 Git에서 제외됩니다. index.html은 Vite 환경변수로 키를 불러옵니다. 변경 후 개발 서버를 재시작하세요.

JavaScript 키는 브라우저에 전달되는 공개 클라이언트 키입니다. Git 제외는 저장소 노출을 막지만 브라우저 노출을 막지는 않습니다. 카카오 콘솔의 허용 도메인을 제한하세요. REST API/Admin 키는 VITE_ 환경변수에 넣지 마세요. `frontend/dist` 역시 키를 포함하므로 Git에서 제외합니다.
카카오 개발자 콘솔에서 카카오맵 사용 설정과 웹 사이트 도메인 `http://localhost:5173` 및 `http://127.0.0.1:5173`을 등록한 뒤 브라우저를 새로고침하세요.
공식 가이드: https://apis.map.kakao.com/web/guide/
공식 Drawing API: https://apis.map.kakao.com/web/documentation/#drawing_DrawingManager

키가 없는 상태에서는 설정 안내를 표시합니다. 실제 지도 및 Drawing 동작은 유효한 키 설정 후 검증해야 합니다.

## 사용

- 지도 위 검색창에서 주소 또는 장소 이름을 검색하고 결과를 선택하면 해당 위치로 이동합니다. 검색 핀은 임시 표시이며, 기록하려면 핀 찍기로 저장하세요.

- 상단 카테고리 토글은 마커와 다각형, 기록 목록에 동시에 적용됩니다.
- 새 기록은 좌측 **저장 카테고리**에서 하나를 선택합니다. 복수 레이어 표시와 독립적입니다.
- 이름과 메모 입력 → 핀 찍기 또는 구역 그리기 → 완료 시 자동 POST 저장.
- 다각형은 우클릭으로 마무리합니다. 저장 실패 시 도형 데이터를 유지하며 다시 저장할 수 있습니다.
- 저장 카테고리가 숨김 상태면 그리기를 시작할 때 해당 레이어가 자동 활성화됩니다.
- 목록/지도 도형 선택 → 이름, 메모, 카테고리 수정 및 삭제.
- 기록 상세의 메모 입력란은 내용에 맞춰 자동으로 높이가 늘어납니다. **메모 저장 이력**은 날짜별로 접어 표시하며 날짜를 누르면 저장 시각(한국 시간), 작성 아이디, 당시 메모를 확인할 수 있습니다. 새 기록 생성과 변경 저장마다 이력이 추가됩니다.
- 이전 저장 대비 추가·수정한 글은 초록색으로 강조하고, 삭제·교체된 기존 글은 별도 영역에 붉은 취소선으로 표시합니다. 같은 날짜의 여러 저장도 각각 보존됩니다.
- 상권 데이터나 개발계획을 외부에서 자동 수집하지 않습니다. 사용자가 직접 기록하는 대시보드입니다.

## API

`/api/properties`, `/api/commercial_blocks` 각각:
- GET: GeoJSON FeatureCollection, 선택적 `?category=개발계획` 필터
- POST: 생성 후 GeoJSON Feature (201)
- GET /{id}: GeoJSON Feature
- GET /{id}/revisions: 로그인 계정으로 조회하는 메모 저장 이력 (최신순)
- PUT /{id}: 전체 갱신 후 GeoJSON Feature
- DELETE /{id}: 삭제 (204)

입력 예:
```json
{"name":"성수역","memo":"현장 확인","category":"진행매물","geometry":{"type":"Point","coordinates":[127.0559,37.5446]}}
```
Polygon은 GeoJSON 닫힌 링을 사용합니다. 좌표 순서는 경도·위도이며 SRID 4326으로 저장합니다.
카테고리는 API와 DB 양쪽에서 검증하며 유효하지 않은 다각형은 거부합니다.

`DATABASE_URL` 환경변수로 DB 연결을 바꿀 수 있습니다. 프론트엔드 API 주소는 `VITE_API_URL`로 변경할 수 있습니다.
현재 CORS는 5173 포트의 localhost/127.0.0.1을 허용합니다. 로컬 개발 구성입니다.

## 검증

```sh
uv run --directory backend python tests/smoke.py
npm --prefix frontend run build
npm --prefix frontend run lint
```
통합 검증은 실행 중인 API와 DB를 사용하며 생성한 테스트 데이터는 삭제합니다.
기존 루트 Streamlit/MySQL 파일은 로컬에 보존되어 있지만 새 앱에서 사용하지 않으며 Git 업로드 대상에서 제외합니다.

## 팀과 직원 계정

1. 대시보드에서 **계정 만들기 → 새 팀 만들기**로 첫 직원 계정을 만듭니다.
2. 표시된 팀 초대 코드를 팀원에게 전달합니다. 이후 **팀 초대 코드 발급**으로 재발급하면 기존 코드는 폐기됩니다.
3. 팀원은 **계정 만들기 → 초대 코드로 기존 팀 가입**으로 개인 아이디를 만듭니다.
4. 로그인 후 전체 팀 / 내 팀 / 작성자 / 내 기록 필터를 카테고리 토글과 함께 사용할 수 있습니다.

현재는 로그인한 직원 전체가 모든 팀의 기록을 조회하는 공유 방식입니다. 팀 간 비공개 격리가 아닙니다.
수정·삭제는 작성자만 가능합니다. 작성자와 팀은 서버의 로그인 계정에서 저장하며 요청으로 덮어쓸 수 없습니다.
기존 기록은 작성자·팀 미지정으로 보존하고 일반 계정에서는 읽기만 허용합니다.
팀 이동, 관리자 계정 관리, 비밀번호 재설정은 현재 UI 범위에 포함되지 않습니다.

비밀번호는 개별 salt를 사용한 scrypt 해시로 저장합니다. 세션은 서버에 토큰 해시로 저장하고 12시간 후 만료됩니다.
브라우저는 HttpOnly / SameSite=Lax 쿠키를 사용합니다. 로그아웃하면 서버 세션을 삭제합니다.
프론트엔드는 동일 출처 `/api`를 Vite 프록시로 호출합니다. 배포할 때도 `/api`를 백엔드로 전달하고 HTTPS 및 `COOKIE_SECURE=1` 설정이 필요합니다.
인터넷 공개 운영 전에는 가입 정책, 로그인 속도 제한 및 비밀번호 재설정 등의 운영 정책을 추가해야 합니다.

DB 시작 시 `teams`, `users`, `login_sessions`를 생성하고 기존 도형 테이블에 nullable 작성자/팀 외래키를 추가하는 멱등 마이그레이션을 수행합니다.
기존 도형 데이터와 좌표는 삭제하지 않습니다.
이전 버전에 저장된 기록에는 과거 메모 이력이 없으며 다음 저장부터 이력이 시작됩니다. 기록 삭제 시 해당 메모 이력도 함께 삭제됩니다.

## 지도 연결 진단

로컬 개발 서버의 `/__map-status`는 키 값을 반환하지 않고 카카오 인증 상태만 진단합니다.
지도 로딩에 실패하면 화면에 도메인 불일치, 카카오맵 서비스 비활성화, 네트워크 오류 등을 안내합니다.
카카오의 `disabled OPEN_MAP_AND_LOCAL service` 응답은 개발자 콘솔에서 해당 앱의 카카오맵 사용 설정을 활성화해야 해결됩니다.
이 진단은 Vite 개발 서버 전용이며 실제 배포에서는 기본 연결 안내를 표시합니다.
