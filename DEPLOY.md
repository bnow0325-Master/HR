# BNOW HR 운영 배포

## 운영 기준

- GitHub: `bnow0325-Master/HR`
- 브랜치: `main`
- 운영 URL: `https://hr.bnow.co.kr`
- 서버: Ubuntu `210.116.101.13`
- 애플리케이션: Docker Compose, 내부 바인딩 `127.0.0.1:3010`
- 프록시·TLS: Nginx, Let's Encrypt
- 데이터베이스: Neon PostgreSQL

상세 명령과 롤백 절차는 [deploy/README.md](./deploy/README.md)를 따릅니다.

## 배포 순서

1. 기능 브랜치에서 `npm run check`를 통과시킨다.
2. PR을 `main`에 병합한다.
3. Git 추적 파일만 서버 `/opt/bnow/checkinout`에 반영한다.
4. 서버의 `.env.production.local`이 보존됐고 WorkBoard SSO 환경변수가 있는지 확인한다.
5. `docker compose -f compose.production.yml up -d --build`를 실행한다.
6. 컨테이너 헬스와 DB 마이그레이션을 확인한다.
7. HTTPS 주요 화면과 API를 검증한다.

## 필수 검증

```text
https://hr.bnow.co.kr/attendance
https://hr.bnow.co.kr/check
https://hr.bnow.co.kr/records
https://hr.bnow.co.kr/leave
https://hr.bnow.co.kr/business-trips
https://hr.bnow.co.kr/admin/login
https://hr.bnow.co.kr/api/employees
https://hr.bnow.co.kr/api/auth/workboard/me
```

## 비밀값

`DATABASE_URL`, `ADMIN_PASSWORD`, `QR_TOTP_SECRET`, `WORKBOARD_SSO_SECRET`,
`WORKBOARD_SUPABASE_SERVICE_ROLE_KEY`, 내부 API 토큰 등은 서버의
`/opt/bnow/checkinout/.env.production.local`에만 저장하고 Git에 기록하지 않습니다.

## 롤백

신규 컨테이너에 문제가 있으면 직전 정상 이미지로 되돌리고 Nginx 설정은 유지합니다.
DB 스키마 변경이 포함된 경우 PR에 기록된 마이그레이션 롤백 절차를 우선 적용합니다.

BNOW HR의 운영 배포는 이 자체 서버 절차만 사용합니다.
