# PropSight 배포

Dockerfile은 React를 빌드한 다음 FastAPI에서 같은 주소로 제공합니다.
PostGIS 확장을 지원하는 영구 PostgreSQL DB가 별도로 필요합니다. 첨부파일도 DB에 저장됩니다.

## 호스팅 설정

- Dockerfile: 루트 Dockerfile
- 빌드 변수: VITE_KAKAO_APP_KEY (카카오 JavaScript 키)
- 런타임 변수: DATABASE_URL, ALLOWED_ORIGINS, VWORLD_API_KEY, VWORLD_DOMAIN,
  BUILDING_PERMIT_API_KEY, HOUSING_PERMIT_API_KEY, BUILDING_REGISTER_API_KEY
- ALLOWED_ORIGINS: 실제 HTTPS 주소. 여러 주소는 쉼표로 구분.
- VWORLD_DOMAIN: 브이월드에 등록한 서비스 주소.
- COOKIE_SECURE=1, SERVE_FRONTEND=1은 이미지 기본값.
- PORT는 호스팅 서비스에서 제공하는 포트를 사용. 기본값 8000.
- 상태 확인: /health

.env 파일은 Git과 Docker 빌드 컨텍스트에서 제외됩니다. 키는 호스팅 설정에 직접 입력합니다.
JavaScript 키는 브라우저로 제공되는 공개 키이므로 카카오에 배포 도메인을 등록하고 허용 도메인을 제한합니다.
서버용 공공 API 키는 브라우저에 보내지 않습니다.

로컬 DB 데이터는 자동 이전하지 않습니다. 새 DB에는 새 계정과 기록이 만들어집니다.
현재 팀 구분은 조회 필터이며, 로그인한 사용자는 다른 팀의 기록도 볼 수 있습니다.
공개 회원가입이 가능하므로 현재 구조는 내부 검토용이며 기밀 자료를 운영하기 전 접근 정책을 결정해야 합니다.

## 무료 배포: Render Free + Neon Free

render.yaml은 무료 웹 서비스만 생성합니다. 유료 Render DB는 생성하지 않습니다.
Render 무료 DB는 30일 후 만료되므로 Neon Free DB를 연결합니다.
Render는 15분 동안 요청이 없으면 절전되어 첫 접속이 느릴 수 있습니다.
Neon 무료 저장 한도에는 첨부파일도 포함됩니다. 무료 사용량을 넘으면 업그레이드하지 않고 용량을 정리합니다.

### 설정 순서

1. Render에서 GitHub 계정으로 가입하고 이메일 인증을 완료합니다.
2. https://console.neon.tech 에서 Free 플랜으로 propsight 프로젝트를 생성합니다.
3. Neon Connect에서 PostgreSQL 연결 문자열을 복사합니다. 비밀번호가 포함되어 있으므로 채팅/GitHub에 붙여넣지 않습니다.
4. https://render.com/deploy?repo=https://github.com/juvia2/Propsight 에서 Blueprint를 생성합니다.
5. DATABASE_URL에 Neon 연결 문자열을 직접 입력합니다. SSL 옵션을 유지합니다.
6. 나머지 다섯 키는 기존 로컬 환경 파일에서 Render 환경변수 입력란으로 직접 복사합니다.
7. 웹 서비스 플랜이 Free이고 유료 리소스가 없는지 확인한 뒤 배포합니다.
8. 생성된 HTTPS 주소를 카카오 JavaScript SDK 허용 도메인과 브이월드 서비스 URL에 등록합니다.
9. 새 주소에서 계정을 만들고 지도, 공공자료 조회, 기록 저장을 확인합니다.

기본 Render 도메인은 ALLOWED_ORIGINS 및 VWORLD_DOMAIN에 자동 적용됩니다.
사용자 도메인을 쓰면 두 환경변수도 설정해야 합니다.
자동 배포는 꺼져 있습니다. 변경 검토 후 Render의 Manual Deploy로 반영합니다.
현재 외부 계정 연결과 배포는 완료되지 않았습니다.
