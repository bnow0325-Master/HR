# BNOW HR — 인사관리 시스템

직원의 회사 출퇴근을 기록하는 웹 애플리케이션입니다.
**원격 출퇴근(집·원격 데스크톱 등)을 막고 실제 사무실에 있어야만 출퇴근**할 수 있도록
**GPS 지오펜싱 + 동적 QR** 이중 인증을 사용합니다.

## 왜 이 방식인가 (원격 차단)

PC 브라우저 버튼 클릭은 원격 접속(RDP, 크롬 원격 데스크톱)을 안정적으로 막을 수
없습니다. 원격으로 회사 PC에 접속해 클릭하면 서버 입장에서 현장 클릭과 구분되지
않기 때문입니다. 그래서 이 앱은 **물리적으로 현장에 있어야만 만들 수 있는 신호**를
검증합니다.

| 신호 | 역할 |
|------|------|
| **GPS 지오펜싱** | 직원 폰이 사무실 좌표 반경(기본 150m) 안에 있어야 함 |
| **동적 QR (TOTP)** | 사무실 화면에 30초마다 바뀌는 QR을 폰으로 스캔해야 함. 캡처 재사용 불가 |

두 신호가 **모두** 통과해야 출퇴근 기록이 `verified` 처리됩니다. 원격 사용자는
사무실 반경 밖이라 GPS에서 막히고, 실시간으로 바뀌는 QR도 볼 수 없습니다.

## 기술 스택

- **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5.9**
- **Prisma 7 + PostgreSQL** — 런타임은 드라이버 어댑터(`@prisma/adapter-pg`),
  마이그레이션 설정은 `prisma.config.ts` (Neon / Vercel Postgres / Supabase)
- **Tailwind CSS 4** (`@tailwindcss/postcss`, CSS `@theme`)
- **otplib 13** (동적 QR TOTP), **qrcode** (QR 이미지), **html5-qrcode** (카메라 스캔)

## 배포 · 로컬 관리

- 폰에서 실제로 쓰려면 HTTPS 배포가 필요합니다 → **[DEPLOY.md](./DEPLOY.md)** (Vercel + Neon, 무료)
- 내 PC(예: `D:\project\checkinout`)에서 내려받아 수정·반영하려면 → **[LOCAL_SETUP.md](./LOCAL_SETUP.md)**
  (Windows 도우미 스크립트 `setup.bat`/`update.bat`/`dev.bat`/`push.bat` 포함)
- 에이전트/Codex 개발 규칙 → **[AGENTS.md](./AGENTS.md)**

## 화면 구성

| 경로 | 설명 |
|------|------|
| `/` | 홈 (진입 메뉴) |
| `/check` | 직원용 출퇴근 화면 — 직원 선택 → 위치 확인 → QR 입력 → 출근/퇴근 |
| `/kiosk` | 사무실 태블릿/모니터용 QR 화면 (자동 갱신) |
| `/admin` | 관리자 대시보드 — 오늘/주간/월간/연간 인사관리 집계, CSV (로그인 필요) |
| `/admin/employees` | 관리자 — 직원·PIN 등록/관리 (로그인 필요) |
| `/admin/login` | 관리자 로그인 (`ADMIN_PASSWORD`) |

## 로컬에서 시작하기

로컬 개발에도 PostgreSQL이 필요합니다 (Neon 무료 DB를 그대로 써도 됩니다).

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
#   - DATABASE_URL : PostgreSQL 연결 문자열 (Neon 등)
#   - OFFICE_LATITUDE / OFFICE_LONGITUDE / OFFICE_RADIUS_METERS : 사무실 위치
#   - QR_TOTP_SECRET : 무작위 비밀키로 교체 (예: openssl rand -hex 32)

# 3. 데이터베이스 준비
npm run db:migrate   # 마이그레이션 적용
npm run db:seed      # 데모 직원 3명 생성 (PIN 1234 / 5678 / 9012)

# 4. 개발 서버 실행
npm run dev          # http://localhost:3000
```

키오스크 화면(`/kiosk`)을 사무실 모니터에 띄워두고, 직원은 폰으로 `/check`에
접속해 출퇴근합니다.

## 로드맵

- [x] **1단계 (MVP)** — 프로젝트 구조, 출퇴근 기록, 관리자 목록, GPS + 동적 QR 검증
- [x] **2단계** — 폰 카메라로 QR 직접 스캔 (수동 입력은 폴백으로 유지), 본인 확인용 PIN 인증
- [x] **3단계** — 관리자 대시보드(주간·월간·연간 인사관리 집계, CSV 내보내기)
- [x] **4단계** — 프로덕션 배포 준비(PostgreSQL 전환, 마이그레이션, Vercel 배포 가이드 → [DEPLOY.md](./DEPLOY.md)), 관리자 로그인 + 직원·PIN 관리 화면
- [ ] **다음** — 사무실 WiFi(BSSID) 보조 검증, NFC 태깅 옵션, 근무 규칙(지각/초과근무)

### 인증 (본인 확인)

출퇴근 시 **직원 선택 + 4자리 PIN**으로 본인을 확인합니다. 이름만으로는 남이 대신
찍을 수 있으므로, 각자만 아는 PIN을 함께 입력해야 기록됩니다. PIN은 평문으로
저장하지 않고 scrypt 해시로만 보관합니다. (데모 PIN — 김철수 `1234`, 이영희 `5678`,
박민수 `9012`. 실제 운영 시 변경하세요.)

전체 검증 순서: **PIN(본인) → GPS(사무실 반경) → 동적 QR(현장)** — 셋 다 통과해야 기록.

> **카메라 사용 시 주의:** 브라우저의 카메라 접근(`getUserMedia`)은 보안 컨텍스트에서만
> 동작합니다. `localhost`는 되지만, 실제 폰에서 테스트하려면 **HTTPS**가 필요합니다.
> 배포 시 HTTPS 도메인(예: Vercel)을 사용하세요.

## 데이터 모델

- `Employee` — 직원(사번, 이름, 부서, PIN 해시)
- `AttendanceRecord` — 출퇴근 기록(출근/퇴근, 시각, 방식, 위치, 현장확인 여부)
