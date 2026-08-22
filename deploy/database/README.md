# BNOW HR PostgreSQL 자체 호스팅

이 구성은 기존 시스템 PostgreSQL 16과 분리된 PostgreSQL 18 컨테이너를
`1-ubuntu`에 만든다. HR 앱은 데이터 검증과 최종 전환이 끝날 때까지 Neon을
계속 사용한다.

## 안전 원칙

- PostgreSQL 포트를 호스트나 인터넷에 공개하지 않는다.
- 데이터는 Docker 영구 볼륨 `bnow_hr_postgres_data`에 저장한다.
- 비밀번호는 `/opt/bnow/hr-database/secrets/postgres_password`에만 저장한다.
- 백업은 `/opt/bnow/hr-database/backups`에 권한 `0600`으로 저장한다.
- 로컬 백업의 복원 시험이 성공해도 별도 서버 백업 전에는 운영 DB를 전환하지 않는다.
- 현재 시스템 PostgreSQL 16과 그 데이터베이스는 수정하지 않는다.

## 서버 파일

```text
/opt/bnow/hr-database/
  .env
  compose.yml
  backups/
  bin/
  secrets/postgres_password
```

`.env`는 `.env.example`을 기준으로 서버에서 만들고 Git에 커밋하지 않는다.
공식 PostgreSQL 이미지는 서버에서 검증한 digest로 고정해 동일한 이미지를 재현한다.
`postgres_password`는 충분히 긴 무작위 값으로 서버에서 생성하며 권한을 `0600`으로
설정한다.

## 단계별 적용

1. Compose 구성을 `docker compose config`로 검증한다.
2. PostgreSQL 18 이미지를 받아 이미지 ID와 RepoDigest를 기록한다.
3. 데이터베이스만 기동하고 healthcheck가 `healthy`인지 확인한다.
4. 시험 테이블 1건을 만들고 즉시 백업한다.
5. 백업을 임시 데이터베이스에 복원하고 시험 데이터가 있는지 확인한다.
6. 원본 시험 테이블과 임시 복원 데이터베이스를 삭제한다.
7. 수동 백업 성공 후에만 systemd timer를 활성화한다.

## 롤백

이 단계에서는 HR 앱이 Neon을 계속 사용하므로 DB 컨테이너를 중지해도 운영 서비스에
영향이 없다. 문제가 발생하면 timer를 비활성화하고 Compose 프로젝트를 중지한다.
영구 볼륨은 복원 검증이 끝날 때까지 삭제하지 않는다.
