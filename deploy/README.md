# BNOW HR 자체 서버 배포

BNOW HR은 Ubuntu 운영 서버에서 Docker Compose로 실행하고, 호스트 Nginx가
`hr.bnow.co.kr`의 HTTPS를 종료한 뒤 `127.0.0.1:3010`으로 프록시한다.

## 운영 구성

- 앱: Next.js standalone 컨테이너
- DB: 기존 Neon PostgreSQL 유지
- 외부 공개: Nginx 80/443만 사용
- 내부 앱 포트: `127.0.0.1:3010`
- 인증: 자체 Keycloak의 `hr-server` confidential OIDC client
- 환경변수: 서버의 `/opt/bnow/checkinout/.env.production.local`에만 저장

Neon에서 자체 PostgreSQL로 이전하는 격리 구성과 백업 절차는
[`database/README.md`](./database/README.md)를 따른다. 자체 DB의 복원 시험과
데이터 검증이 끝날 때까지 운영 앱의 `DATABASE_URL`은 변경하지 않는다.

## 배포

```bash
cd /opt/bnow/checkinout
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml ps
curl -I http://127.0.0.1:3010/check
```

Compose는 앱 시작 전에 Prisma 운영 마이그레이션을 적용한다. 마이그레이션이
실패하면 앱을 새로 시작하지 않는다.

## Nginx와 TLS

1. `deploy/nginx/hr.bnow.co.kr.conf`를
   `/etc/nginx/sites-available/hr.bnow.co.kr`에 설치한다.
2. `sites-enabled`에 심볼릭 링크를 만든 뒤 `nginx -t`를 통과시킨다.
3. DNS A 레코드가 `210.116.101.13`을 가리키는지 확인한다.
4. `certbot --nginx -d hr.bnow.co.kr`로 인증서를 발급한다.

## 롤백

새 컨테이너에 문제가 있으면 직전 정상 Docker 이미지로 앱을 되돌린다. Nginx와
TLS 설정은 유지하고 `/attendance`, `/check`, `/leave`, `/business-trips`,
`/api/auth/company/login`, `/admin`, `/api/employees`를 다시 검증한다.
