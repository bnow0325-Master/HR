# HR 무상체험 농가 재직 확인 API 배포

- 배포일: 2026-11-03 16:51 KST
- 기능 커밋: `09a032d7d466fe3440ea858a46be41b676553490` (HR `main`, PR #112)
- 릴리스 경로: `/opt/bnow/hr-releases/09a032d-20261103-trial-access`
- Docker Compose 프로젝트: `bnow-checkinout`
- 앱 컨테이너 ID: `5595f60647078a8f5c05c82bdfa06b7196183c6ad7fa82cd730173bfc3d73abc`
- 앱 이미지: `sha256:477deb5e0a63e140ec15be03e902ff2d58b0c08224605294e441cba52589e25b`
- 직전 릴리스: `/opt/bnow/hr-releases/159a83c-negative-leave-20261103`
- 직전 앱 이미지: `sha256:4282669bb96aca00fc6c6e45c04db904a58b95eb0d9cef275f78ea04a69afd9e`
- 환경파일: 직전 릴리스의 `.env.production.local`을 신규 릴리스로 권한과 함께 복사. 값은 기록하지 않음.
- DB 마이그레이션: 없음.

## 변경

토큰으로 보호된 `GET /api/internal/trial-access?email=`을 추가했다. HR 직원명부에서 `active=true`, 퇴사일 없음, 회사 또는 개인 이메일 일치를 확인하고 최소한의 식별 정보만 반환한다. 미등록·퇴사자는 `employee:null`로 응답한다.

## 검증

- PR CI `validate` 통과. 로컬 타입 검사와 운영 빌드 통과. 로컬 빌드는 비운영 `DATABASE_URL`로 수행했다.
- 컨테이너가 신규 릴리스 경로에서 `running` 상태임을 확인했다.
- 운영 API에서 박관식의 회사 이메일은 재직자로 조회됐다. 일치하지 않는 임의 이메일은 `employee:null`이었다.
- 토큰 없이 API 요청 시 HTTP 401이었다.
- `/attendance`, `/check`, `/records`, `/leave`, `/business-trips`는 HTTPS 200, `/admin/login`은 정상 로그인 리디렉션 307이었다.
- 실제 직원의 지도 접근은 지도 사이트 쪽 연동 배포 후 별도로 확인한다.

## 복원

문제가 생기면 직전 릴리스 경로에서 `sudo docker compose -f compose.production.yml up -d --build`를 실행한다. 직전 소스와 환경파일은 보존했다. 복원 후 주요 화면과 내부 API의 인증 응답을 다시 확인한다.
