# BNOW HR

BNOW 임직원의 출퇴근, 근무기록, 휴가, 출장, 직원명부를 통합 관리하는 내부
인사관리 시스템입니다.

## 운영 정보

- 운영 URL: [https://hr.bnow.co.kr](https://hr.bnow.co.kr)
- GitHub: [bnow0325-Master/HR](https://github.com/bnow0325-Master/HR)
- 로컬 기준 경로: `D:\project\hr`
- 배포: Ubuntu 자체 서버, Docker Compose, Nginx, Let's Encrypt
- DB: Neon PostgreSQL

## 주요 기능

- 오늘 출근·퇴근 등록과 실시간 근무시간 표시
- 본인 월별 출퇴근 기록 조회
- 관리자 기간별 근무 집계와 CSV 내보내기
- 휴가 신청, 연차 현황, 신청 내역 관리
- 출장 기간·사유·출장일지 관리
- 직원명부, 입·퇴사 상태, 인사관리 및 사내 서비스 권한 관리
- 자체 사내 계정으로 로그인해 전 메뉴에서 동일한 직원으로 자동 연결

## 화면 구성

| 경로 | 설명 |
|---|---|
| `/attendance` | 인사관리 통합 허브 |
| `/check` | 출근·퇴근 등록 |
| `/records` | 본인 출퇴근 기록부 |
| `/leave` | 휴가 신청과 연차 현황 |
| `/business-trips` | 출장 신청과 출장일지 |
| `/admin` | 관리자 근무 집계 |
| `/admin/employees` | 직원명부와 권한 관리 |
| `/admin/login` | 사내 통합 로그인 및 관리자 권한 확인 |
| `/kiosk` | 선택형 QR 키오스크 화면 |
| `/auth/company` | 사내 통합 로그인 오류 및 재로그인 안내 |

## 기술 스택

- Next.js 16, React 19, TypeScript 5.9
- Tailwind CSS 4
- Prisma 7, PostgreSQL(Neon)
- Docker Compose, Nginx, Let's Encrypt

## 로컬 실행

자세한 절차는 [LOCAL_SETUP.md](./LOCAL_SETUP.md)를 참고합니다.

```powershell
Set-Location D:\project\hr
npm ci
npm run dev
```

운영·로컬 환경변수는 Git에서 제외된 `.env` 또는 `.env.production.local`에만
저장합니다.

## 사내 통합 인증

`D:\PROJECT\bnow-identity`의 자체 Keycloak이 로그인과 비밀번호를 담당하고, HR
직원명부가 재직 상태와 애플리케이션 권한의 기준 원장입니다. HR과 WorkBoard는
각각 confidential OIDC BFF client를 사용하므로 브라우저에는 Keycloak client
secret이나 access token을 저장하지 않습니다.

직원 저장·수정·퇴사 처리 시 HR이 사내 계정과 역할을 즉시 동기화합니다. 퇴사자는
기록 보존을 위해 삭제하지 않고 계정과 모든 관리 역할을 비활성화합니다. 관리자
페이지도 별도 공용 비밀번호 없이 로그인한 직원의 `systemRole=ADMIN`과
`company_admin/hr_admin` 권한으로 접근합니다.

- `BNOW_IDENTITY_URL`, `BNOW_IDENTITY_REALM`: 자체 Keycloak 위치와 realm
- `BNOW_IDENTITY_ADMIN_CLIENT_*`: 직원 계정·권한 동기화용 service account
- `BNOW_IDENTITY_LOGIN_CLIENT_*`: HR 로그인용 `hr-server` confidential client
- `BNOW_IDENTITY_LOGIN_REDIRECT_URI`: HR OIDC callback의 정확한 HTTPS 주소
- `BNOW_IDENTITY_SESSION_SECRET`: HR HttpOnly 세션과 로그인 흐름 서명 키

직원관리의 `전체 직원 인증 동기화`는 기존 직원을 5명씩 처리하며 재직자는 역할을
갱신하고 퇴사자는 계정을 비활성화합니다. `임시 비밀번호 설정`은 Keycloak에만
일회성 비밀번호를 기록하며, 사용자는 다음 로그인에서 새 비밀번호로 변경해야 합니다.
이 코드 경로에는 Supabase URL·키·Auth API가 필요하지 않습니다.

퇴사, `workboardEnabled` 해제 또는 회사 이메일 변경 시 HR은 LC_CHAT 내부 API를
호출해 해당 직원의 라이브카우톡 세션과 푸시 기기를 함께 폐기합니다. 필요한
`CUSTOMER_CHAT_INTERNAL_URL`과 `CUSTOMER_CHAT_INTERNAL_KEY`가 없거나 호출에
실패하면 HR 변경을 저장하지 않고 `persisted=false`와 HTTP 502를 반환하므로,
이메일 변경 후 기존 세션이 남는 재시도 누락도 방지합니다. LC_CHAT도 매 요청에서 최대 60초
간격으로 HR 권한을 재확인해 연동 장애 시 권한이 계속 유지되지 않게 합니다.

## 검사와 배포

```powershell
npm run check
```

PR을 `main`에 병합한 뒤 [deploy/README.md](./deploy/README.md)의 자체 서버 배포
절차를 수행합니다.

## 데이터 모델

- `Employee`: 직원명부, 재직 상태, 권한
- `AttendanceRecord`: 출퇴근 기록과 위치
- `LeaveRequest`: 휴가 신청과 승인 상태
- `BusinessTrip`: 출장 기간, 사유, 출장일지

## 내부 직원명부 연동

전자계약 등 내부 시스템은 Bearer 인증이 적용된
`GET /api/internal/employee-directory`를 통해 HR 명부를 조회합니다. 기본 응답은
재직자만 포함하며, 관리자용 전체 동기화는 `includeInactive=1`을 사용해 퇴사일과
재직 상태까지 전달합니다. `systemRole`, `attendanceEnabled`, `leaveEnabled`,
`workboardEnabled`도 함께 전달해 각 사내 서비스가 HR 권한을 최종 기준으로
사용합니다. 연동 토큰은 서버 환경변수에만 저장합니다.

개발 규칙은 [AGENTS.md](./AGENTS.md), 배포 요약은 [DEPLOY.md](./DEPLOY.md)를
참고합니다.
