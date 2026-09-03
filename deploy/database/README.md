# BNOW HR MariaDB 자체 호스팅

이 구성은 HR 전용 MariaDB 11.4를 `1-ubuntu`에 만들며 WorkBoard의 PostgreSQL과
채팅용 MariaDB를 수정하거나 공유하지 않는다. HR 앱은 복제·검증·백업이 모두 성공할
때까지 기존 PostgreSQL을 계속 사용한다.

## 격리 및 개인정보 원칙

- DB 포트는 호스트와 인터넷에 공개하지 않는다.
- HR 전용 데이터베이스 `bnow_hr`, 계정, Docker 볼륨을 사용한다.
- 직원 화면과 일반 직원 API에는 출퇴근 좌표를 반환하지 않는다.
- 출퇴근 시 위도·경도만 내부 저장하고 주소 문자열은 생성·저장하지 않는다.
- 과거 `AttendanceRecord.note`의 주소 문자열은 MariaDB 이전 시 `NULL` 처리한다.
- 비밀번호는 `/opt/bnow/hr-mariadb/secrets/`에만 저장하고 Git에 커밋하지 않는다.
- 백업은 권한 `0600`, SHA-256 체크섬과 함께 14일 보관한다.

## 서버 파일

```text
/opt/bnow/hr-mariadb/
  .env
  compose.yml
  backups/
  bin/
  secrets/mariadb_password
  secrets/mariadb_root_password
```

## 전환 순서

1. MariaDB 이미지 digest를 확인해 `.env`의 `MARIADB_IMAGE`에 고정한다.
2. Compose 설정 검증 후 MariaDB만 기동하고 healthcheck를 확인한다.
3. `prisma migrate deploy`로 빈 MariaDB에 기준 스키마를 적용한다.
4. 운영 PostgreSQL 백업을 만들고 별도 복원 시험을 수행한다.
5. `SOURCE_DATABASE_URL`과 MariaDB `DATABASE_URL`을 일회성 파일에 넣어
   `npm run db:migrate-data:mariadb`를 실행한다.
6. 스크립트가 모든 테이블의 건수와 SHA-256 검증을 통과했는지 확인한다.
7. 앱을 잠시 쓰기 중지하고 최종 복제를 다시 수행한 뒤 HR 앱만 MariaDB로 전환한다.
8. 직원 로그인, 출퇴근, 휴가, 출장, 명부 관리 회귀 시험 후 백업 timer를 활성화한다.

`restore-smoke-test.sh`가 5개 HR 테이블의 복원 확인 표식을 남긴 경우에만
`provision.sh`가 systemd 일일 백업 timer를 활성화한다.

서버에서는 추적된 도구를 아래 순서로 사용한다. 스크립트는 비밀값을 출력하지 않으며
앱 환경파일 변경 전 자동 백업을 남긴다.

```bash
sudo ./bin/provision.sh
sudo ./bin/prepare-app-env.py prepare-migration --app-dir /opt/bnow/hr-releases/<commit>
sudo ./bin/backup-source-postgres.sh /opt/bnow/hr-releases/<commit>
# 앱 쓰기를 중지한 뒤 스키마와 데이터 이전·검증 수행
sudo ./bin/prepare-app-env.py cutover --app-dir /opt/bnow/hr-releases/<commit>
```

기존 `/opt/bnow/checkinout` 작업트리가 수정 상태이면 덮어쓰거나 초기화하지 않는다.
검증된 `origin/main`을 `/opt/bnow/hr-releases/<commit>`에 분리하고 기존 환경파일만
권한 `0600`으로 복사한 뒤 새 릴리스에서 Compose를 실행한다.

## 롤백

기존 PostgreSQL은 삭제하거나 수정하지 않는다. 전환 실패 시 앱의 `DATABASE_URL`을
이전 값으로 되돌려 재배포한다. MariaDB 볼륨과 백업은 원인 확인이 끝날 때까지
삭제하지 않는다.
