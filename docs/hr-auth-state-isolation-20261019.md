# HR 통합 로그인 다중 탭 인증 보강 기록

## 기준과 범위

- 공식 저장소: `bnow0325-Master/HR`; 격리 브랜치: `codex/hr-auth-state-isolation-20261019`.
- 작업 기준 `origin/main`: `e26304fa61ff21d724fc4fa064e0995da5c08bed`.
- 가장 최근 운영 배포 태그 `deploy/unified-approvals-20260929-1155`도 같은 커밋을 가리킨다. 운영 서버의 `/opt/bnow/checkinout-release/.deployment-commit`과 활성 HR 릴리스는 해당 커밋이며, HR 앱 컨테이너는 정상 상태였다.
- 기존 `D:\PROJECT\hr` 체크아웃에는 미커밋 `AGENTS.md`가 있고, 별도의 `hr-auth-multitab` 작업트리에도 변경이 있어 어느 쪽도 수정하지 않았다.

## 재현과 변경

기존 `/api/auth/company/login`은 모든 요청의 서명된 OAuth flow를 `bnow_hr_oauth` 한 쿠키에 저장했다. 두 탭에서 각각 로그인하면 뒤 요청이 앞 요청의 `state`, PKCE `verifier`, `returnTo`를 덮어쓰고, 앞 콜백은 실패했다. 새 회귀 테스트는 두 로그인 응답의 쿠키 이름이 다르고, 콜백을 역순으로 처리해도 각 verifier와 복귀 경로가 맞는지 검사한다.

| 파일 | 변경 |
| --- | --- |
| `src/lib/companyOidc.ts` | 생성된 state에 대응하는 쿠키 이름과 서명된 flow의 state 검증 함수 추가 |
| `src/app/api/auth/company/login/route.ts` | 요청별 쿠키 저장; 기존 세션의 서명·만료·재직 상태를 확인해 유효하면 요청 경로로 바로 이동 |
| `src/app/api/auth/company/callback/route.ts` | 콜백 state에 해당하는 쿠키만 읽고 삭제; 기존 재직자 DB 검증과 HR 역할 검증 유지 |
| `src/lib/workboardSession.ts` | 요청 쿠키의 세션 토큰을 DB 재직 상태와 함께 검사하는 함수를 재사용 가능하게 분리 |
| `src/app/auth/company/page.tsx` | 유효 세션이 오류/재로그인 화면에 도달하면 출퇴근 홈으로 이동 |
| `src/lib/companyOidc.test.ts`, `src/lib/companyAuthRoutes.test.ts`, `package.json` | 병렬 로그인, 역순 콜백, 해당 쿠키만 삭제, 유효·비활성 세션, 독립적인 다른 세션을 검사하고 인증 테스트 명령에 포함 |

## 검증

- `npm ci` 완료.
- Node 22에서 `npm run test:identity`: 24개 통과.
- Node 22에서 모든 `src/lib/*.test.ts`: 35개 통과.
- Node 22에서 `npm run check`: 타입 검사 및 프로덕션 빌드 통과. 빌드에는 작업트리에 DB 비밀값이 없으므로 프로세스에만 연결하지 않는 더미 `DATABASE_URL`을 제공했다.
- `git diff --check`: 통과.
- 실제 운영 계정의 브라우저 인증은 배포 후 별도 검증 대상이다.

## 배포 전 보호 조치

- 이전 커밋 `e26304f`에 `backup/pre-hr-oauth-multitab-20261019` 태그를 만들고 원격에 보관했다.
- 운영 서버 `/home/elonchoo/deploy-backups/hr-auth-multitab-20261019-2040`에 이전 HR 릴리스, 환경파일, 새 HR MariaDB 덤프, 이전 컨테이너 정보와 체크섬을 보관하고 압축 무결성을 확인했다.
- 같은 경로의 `rollback.sh`는 이전 HR Compose 릴리스를 다시 빌드·기동하고 `/opt/bnow/hr-current` 링크와 `/check` 상태를 확인한다. `bash -n` 구문 검사를 통과했다.
- 서버의 `/opt/bnow/checkinout-release`에는 과거 배포로 인한 대량의 Git 변경 표시가 있어 갱신·초기화하지 않는다. 새 릴리스 디렉터리에만 반영한다.

## 영향과 롤백

- OAuth 쿠키는 요청별로 최대 10분 유지된다. 한 콜백 실패/완료가 다른 진행 중인 콜백의 쿠키를 삭제하지 않는다.
- 기존 유효 세션은 새 OAuth 요청 없이 재사용된다. 다른 기기 세션을 무효화하는 전역 상태나 DB 스키마 변경은 없다.
- 배포 또는 롤백 순간에 진행 중인 OAuth 인증은 쿠키 형식이 달라 한 번 실패할 수 있다. 이 경우 사용자가 로그인을 다시 시작하면 된다.
- 배포 후 문제가 생기면 위 `rollback.sh`로 직전 HR 릴리스를 복구한다. DB 스키마 변경이 없어 DB 마이그레이션 롤백은 필요 없다. 코드 변경은 별도로 Git에서 되돌린다.
