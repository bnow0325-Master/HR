# BNOW HR 개발 지침 (Codex/에이전트용)

## 제품 목적

BNOW HR은 임직원의 인사 정보를 한곳에서 관리하는 내부 시스템이다.

- 출퇴근 등록과 기록 조회
- 근무시간 및 관리자 집계
- 휴가 신청과 연차 관리
- 출장 신청과 출장일지 관리
- 직원명부, 재직 상태, 인사관리 및 WorkBoard 권한 관리

직원명부는 사용자 식별과 권한의 기준 원장이다. 퇴사자는 삭제하지 않고 비활성화해
기존 출퇴근·휴가·출장·업무 기록을 보존한다.

## 운영 기준

- GitHub: `bnow0325-Master/HR`
- 로컬 기준 경로: `D:\project\hr`
- 운영 URL: `https://hr.bnow.co.kr`
- 배포: Ubuntu 자체 서버 + Docker Compose + Nginx + Let's Encrypt
- 데이터베이스: 자체 서버 HR 전용 MariaDB 11.4

## 기술 스택

- Node.js 22, Next.js 16 App Router, React 19, TypeScript 5.9 strict
- Tailwind CSS 4
- Prisma 7 + MariaDB 드라이버 어댑터(`@prisma/adapter-mariadb`)
- otplib 13, qrcode, html5-qrcode

## 작업 원칙

1. 작업 전 `main`의 최신 변경을 받는다.
2. `codex/` 기능 브랜치에서 작업하고 PR로 `main`에 병합한다.
3. 실제 직원 개인정보와 비밀값을 코드·테스트·문서·Git에 기록하지 않는다.
4. `.env`, `.env.production.local`, DB 비밀번호, 토큰은 절대 커밋하지 않는다.
5. 직원 식별, 출퇴근 시간, 위치, 관리자 권한은 서버에서 검증한다.
6. 직원명부 변경과 관리자 기능은 관리자 인증 뒤에 둔다.
7. DB 스키마 변경 시 마이그레이션을 함께 커밋하고 롤백 방법을 PR에 기록한다.
8. 운영 배포 전 자체 서버의 HTTPS, DB 연결, 주요 화면과 API를 검증한다.
9. 출퇴근 위치는 서버 검증과 내부 좌표 저장에만 사용하고 직원 화면·일반 API에는 노출하지 않는다.

## 필수 명령

```bash
npm ci
npm run check
npm run db:migrate
npm run db:migrate:dev -- --name <설명>
npm run db:seed
npm run dev
```

## 완료 기준

- `npm run check` 통과
- `/attendance`, `/check`, `/records`, `/leave`, `/business-trips` 정상 동작
- `/admin`, `/admin/employees` 관리자 인증과 권한 확인
- 직원명부 변경이 출퇴근·휴가·출장·WorkBoard 권한에 일관되게 반영
- 개인정보와 위치정보의 수집·노출 최소화
- `https://hr.bnow.co.kr` 운영 검증 완료
