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
- 직원명부, 입·퇴사 상태, 인사관리 및 WorkBoard 권한 관리

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
| `/admin/login` | 관리자 로그인 |
| `/kiosk` | 선택형 QR 키오스크 화면 |

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
재직 상태까지 전달합니다. 연동 토큰은 서버 환경변수에만 저장합니다.

개발 규칙은 [AGENTS.md](./AGENTS.md), 배포 요약은 [DEPLOY.md](./DEPLOY.md)를
참고합니다.
