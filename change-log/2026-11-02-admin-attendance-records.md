# 2026-11-02 직원별 출퇴근 관리자 조회 배포

- 저장소: `bnow0325-Master/HR`
- 기능 PR: [#105](https://github.com/bnow0325-Master/HR/pull/105), 운영 검증 수정 PR: [#106](https://github.com/bnow0325-Master/HR/pull/106)
- 최종 소스 커밋: `ed90e29b279f52d5c9fbb9f5bd9a7eac816ce665` (`origin/main`)
- 배포 ID: `ed90e29-20261102-admin-attendance-fix`
- 서버/경로: `1-ubuntu`, `/opt/bnow/hr-releases/ed90e29-20261102-admin-attendance-fix`
- 운영 앱 이미지: `sha256:6654fabb533dc155655ff40ad2192a39613e4928192dba50cb6c06d57328c321`
- 운영 URL: <https://hr.bnow.co.kr/admin/attendance-records>
- Alpacon 작업 세션: `e6409485-dd46-4265-8304-a6bf1fd20e09`

## 변경

관리자 홈에 직원별 출퇴근 메뉴를 추가했다. 월 또는 최대 93일 기간과 직원을 선택하면 한국시간 기준 날짜별 첫 출근, 마지막 퇴근, 여러 근무 세션의 합계, 취소 기록과 기록 누락을 확인할 수 있다. 같은 조건으로 CSV를 내려받을 수 있다. 근무 중인 세션은 누락으로 집계하지 않으며, 24시간을 넘긴 열린 세션만 퇴근 미등록으로 표시한다. 직원 본인의 `/records` 경로와 기록 API는 변경하지 않았다. DB 스키마와 마이그레이션 파일도 변경하지 않았다.

## 배포와 백업

1. CI `validate`는 PR #105와 #106에서 각각 통과했다. 로컬 `npm run check`, 집계 테스트 6개, 기존 identity/database/profile-photo 테스트 29개도 통과했다.
2. 운영 기준 릴리스 `a734f201d335b9645f1d7e5ebd279001d09b5b89`와 새 커밋 간 DB 마이그레이션 차이가 없음을 확인했다. 기존 `/opt/bnow/checkinout` 작업트리의 변경사항은 건드리지 않았다.
3. 공식 HR MariaDB 백업 서비스를 실행해 `/opt/bnow/hr-mariadb/backups/bnow_hr_20261102T001643Z.sql.gz`를 생성했다. `.sha256` 검증은 `OK`였다. 이전 정기 백업과 복원 smoke 검증은 2026-11-01에 확인됐다.
4. GitHub `origin/main`에서 만든 최종 소스 묶음은 `hr-ed90e29-20261102-admin-attendance-fix.tar.gz`, SHA-256 `a951d8a89aefb70ec6a14aeb97eb1ee73b3271370add0d8e0cb6f2fbe11103c4`다. 서버 전송 후 같은 해시를 확인했다. 운영 환경파일은 이전 릴리스에서 권한 `0600`으로 새 릴리스에 복사했다.
5. 별도 릴리스에서 Docker Compose 구성을 검증하고 `app`, `migrate` 이미지를 빌드했다. `docker compose up -d --no-build`로 전환했고 `migrate`는 종료 코드 0, `app`은 healthy였다. 중간 검증 릴리스 `510d6a9-20261102-admin-attendance`는 최종 릴리스로 교체됐다.

## 운영 검증

- 컨테이너의 Compose 작업 경로가 최종 릴리스이고 이미지 ID가 위 값과 일치했다.
- 공개 HTTPS `/check`는 200, TLS 검증 결과 0이었다.
- `/attendance`, `/check`, `/records`, `/leave`, `/business-trips`는 200이었다.
- 인증 없는 `/admin`과 새 관리자 화면은 로그인 이동(307), 새 CSV API는 403이었다.
- 인증된 관리자 화면에서 `2026-11-02` 하루 조회 시 7개 직원·일 중 근무 중 4건, 확인 필요 0건으로 표시됐다. 실제 출퇴근 데이터는 수정하지 않았다.

## 복원

직전 정상 이미지 `sha256:04e8fd21bd498fcb46c21e7c6c09d97f3c424de0320b49608564de0871a62ce0`은 `bnow-checkinout-app:rollback-20261102-0924`로 보존했다. 그 이전 이미지 `sha256:55b9babadb7d2ffa56c4cd7b97ac6442d498270dbee80ea63bd782efc969523b`도 `bnow-checkinout-app:rollback-20261102-0917`로 보존했다. 앱 복원은 다음 순서로 수행한다.

```bash
sudo docker tag bnow-checkinout-app:rollback-20261102-0924 bnow-checkinout-app:latest
sudo docker compose --project-directory /opt/bnow/hr-releases/510d6a9-20261102-admin-attendance -f /opt/bnow/hr-releases/510d6a9-20261102-admin-attendance/compose.production.yml up -d --no-build --no-deps app
sudo docker inspect --format '{{.State.Health.Status}}' bnow-checkinout-app-1
curl --fail https://hr.bnow.co.kr/check
```

DB 스키마 변경이 없어 앱 복원에 DB 백업 복원은 필요하지 않다. 백업 파일은 사고 대응용으로 보존한다.
