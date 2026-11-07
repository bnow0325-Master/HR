# 2026-11-07 HR 대표 전용 근태·휴가·출장 알림 운영 배포

## 배포 결과

| 항목 | 확인 결과 |
|---|---|
| 운영 화면 | `https://hr.bnow.co.kr/admin/notifications` |
| 기능 PR | HR #114, #116 모두 main 병합 |
| 운영 코드 | `c173c8753fcdf845102c3c7dd29803d47565f1c5` |
| 릴리스 | `c173c87-20261107-1325-hr-notifications` |
| 실제 Compose 경로 | `/opt/bnow/hr-releases/c173c87-20261107-1325-hr-notifications` |
| 앱 이미지 | `sha256:de0cbbf223af248eda3acba1396ef836c3fbbd7371d0923b1d980f5a6e081300` |
| main 전체 archive SHA256 | `4a3a07f9ee2e77b77c43d3e334fab99dbc27a0028b530e049398d1bf3e3d5b79` |
| 실행 시각 | 2026-11-07 13:25 KST 시작, 약 84초 후 종료 |
| 백업 | `/var/backups/bnow-releases/hr-notifications-c173c87-20261107-1325-hr-notifications` |
| 실제 HR DB 덤프 | `hr-database.sql.gz`, 124,648 bytes, gzip·SHA 검증 통과 |
| 코드 복원 | 위 백업의 `rollback.sh`, 992 bytes, bash 구문 확인 |
| 발송·일정 | 원장 확정 후 outbox, 매분 재시도, 09:00 KST 당일/월요일 주간 요약 |

CHRO가 요구사항·수용 검토, CTO가 통합 검증·서버 실행을 담당했다. 대표실의 기존 직접 개발·즉시 배포 지시가 사전점검·백업·복원 검증을 포함함을 확인해 진행했다. 새 계정·sudo 정책을 만들지 않았다. WorkBoard 코드·인증·업무 원장·배포와 비노우톡 코드·배포는 변경하지 않았다. 알림 메시지만 기존 승인된 직원채팅 API로 저장했다.

## 원인과 구현

- 실제 운영은 `09a032d-20261103-trial-access` 이미지 `477deb5...`였다. `/opt/bnow/hr/current`의 `66869b0` 링크는 실제 실행 근거가 아니었다.
- 실제 HR 앱에는 직원채팅 webhook URL이 미구성이었다. 준비돼 있던 정확한 HR 릴리스의 기존 연동 설정을 새 릴리스 env에만 재사용하고 목적지는 정규 비노우톡 API로 설정했다. 원본 HR env/준비 설정은 보존했고, 거부된 비노우톡 환경파일을 다시 읽지 않았다. 토큰 값은 출력·로컬 복사·Git 기록하지 않았다.
- 출퇴근/취소/승인과 같은 DB 트랜잭션에서 별도 outbox를 만든다. 채팅 장애로 이미 확정된 원장을 되돌리지 않고 같은 멱등 키로 재시도한다. 중복 클릭은 직원행 잠금과 최근 60초 같은 유형 검사로 차단하며 자정 이후 퇴근과 취소 후 재퇴근을 보존한다.
- 대표 operations와 직원 본인 work를 분리하고, 기존 본인 수신 중단 정책을 유지한다. 대표 알림에서 좌표·휴가 사유·결재 메모를 제외한다. 익명·일반 직원·다른 관리자·비활성·ADMIN 해제 계정은 대표 진단 화면/API에 접근하지 못한다.
- HTTP 202만으로 성공 처리하지 않고 `chatOk`와 messageSeq를 확인한다. 대표 개인방 연결 진단은 가짜 근태 기록 없이 하루 한 메시지를 재사용한다.

## 검증

- PR #114 CI run `42337026446`, PR #116 CI run `42338038117` 성공. 알림 행동/규칙/scheduler 38건(실제 CI MariaDB 잠금·원자성 2건 포함), 새 env 준비·경로 차단 6건, 타입 검사·운영 빌드 통과.
- 첫 CI에서 outbox SQL이 비활성 레거시 경로에 있던 것을 발견하고 활성 `prisma/migrations-mariadb`로 수정했다. 실제 DB 시험을 다시 통과했다. 운영에는 수정된 경로로 적용했다.
- 기존 비노우톡 inbound/직원채팅 64개 테스트를 재사용했다. 비노우톡 변경 배포는 없다.
- 배포 전 이전 소스/환경·이미지 참조·HR 전체 덤프·복원 스크립트를 보존하고 5개 파일 SHA를 검증했다. 새 임시 DB로 복원한 뒤 새 outbox SQL과 핵심 5개 테이블을 확인했다. 임시 DB 잔여 수는 0이다. 이는 HR 전용 검증이며 회사 공유 DB 전체 복원과 다르다.
- 운영 앱 healthy, 실제 Compose 경로·이미지 일치. `/attendance`, `/check`, `/records`, `/leave`, `/business-trips` HTTPS 확인.
- 매분 타이머 active, 13:32 KST 최근 실행 `Result=success`, `ExecMainStatus=0` 확인.
- 13:33 KST outbox는 `SENT / operations / 2`, 대기/전송 중 0이었다. 한 건은 첫 실행의 실제 승인 일정 당일 요약, 한 건은 대표 고정 연결 진단이다. 운영에 합성 직원 출퇴근/휴가·출장 원장을 만들지 않았다.
- 대표 세션에서 연결 확인은 SENT와 메시지 번호 `15535`를 반환했다. 재클릭해도 같은 메시지 번호·총 저장 2건을 유지했다. 실제 대표 개인 비노우톡 화면에서 `[BNOW]` 발신, 고정 진단 본문과 13:27 시각을 확인했다. 발송 후 방 메타데이터도 direct/대표+시스템 2명으로 일치했다.
- 운영 익명 진단 API는 403, 인증 없는 scheduler POST는 401이었다. 실제 일반 직원 세션으로 대표 화면을 여는 검증은 하지 않았으며 CI의 권한 검증과 구분한다.
- Windows/Android/iPhone 실제 직원 근태 등록, 휴대폰 푸시·앱 배지 수용은 미검증이다. 채팅 저장·대표 웹 화면 도착을 단말 푸시 도착으로 표현하지 않는다. 다음 정상 업무 이벤트를 CHRO가 대조한다.

## 실행과 감사

기존 `elonchoo` 운영자와 sudo baseline을 사용한 WorkSession `9b20b0ae-23ba-41b6-bdb1-a0143fc359ca`에서 실행하고 종료했다.

```text
alpacon cp --no-overwrite --username elonchoo --work-session 9b20b0ae-23ba-41b6-bdb1-a0143fc359ca ./hr-c173c87-20261107-1325.tar.gz 1-ubuntu:/home/elonchoo/hr-c173c87-20261107-1325.tar.gz

verified-file /bin/bash /home/elonchoo/hr-notifications-deploy-c173c87-20261107-v2.sh
  /home/elonchoo/hr-c173c87-20261107-1325.tar.gz
  4a3a07f9ee2e77b77c43d3e334fab99dbc27a0028b530e049398d1bf3e3d5b79
  c173c8753fcdf845102c3c7dd29803d47565f1c5
  sha256:477deb5e0a63e140ec15be03e902ff2d58b0c08224605294e441cba52589e25b
  /opt/bnow/hr-releases/09a032d-20261103-trial-access
  c173c87-20261107-1325-hr-notifications
```

실행 agent 파일 SHA256은 `46785c649984291740e97e7e047767a2a559f8a9d6d30f9ce301e0ce9c942654`이다. canonical `deploy.sh`의 root 진입부만 기존 sudo와 고정 실파일 경로로 실행하도록 바꿨다. 나머지는 최신 main의 검토된 배포/복원 절차이다. 배포 명령 `3f3cb49a-0547-4aa1-bbe2-c4580ff7d5ac`는 exit 0이다.

초기 agent 실행은 `/proc/self/fd/3` 재진입 실패 exit 127로 root 진입 전에 중단했다. 다음 버전의 MCP 응답은 504였지만 동일 명령을 재실행하지 않고 명령 이력에서 완료·exit 0을 확인했다. 사후 검증 한 파일은 SQL 인용 구문 오류로 집계 전에 멈췄으며, 남은 읽기 집계만 올바른 heredoc으로 확인했다(command `142cdb7b-70f5-4cb5-8c64-09eae451d65a`, exit 0).

감사용 사용자 홈 파일은 배포/preflight/환경 메타데이터/사후 검증 파일들이다. 수기 토큰 호환 시험 파일은 플랫폼이 `command_inline_credential`로 반려해 실행되지 않았고 재시도하지 않았다. 실제 연결은 정상 HR 앱의 대표 전용 진단 기능으로 검증했다.

## 복원

승인된 운영 세션에서 다음 파일을 실행한다.

```bash
sudo -n bash /var/backups/bnow-releases/hr-notifications-c173c87-20261107-1325-hr-notifications/rollback.sh
```

현재 앱이 이 배포 릴리스일 때만 타이머를 중단하고 직전 이미지·Compose 경로로 복원한다. 다른 릴리스가 실행 중이면 복원을 거절한다. 새 HR 원장·outbox를 과거 DB로 덮어쓰거나 outbox 테이블을 삭제하지 않는다. 이전 실행 코드 `09a032d7d466fe3440ea858a46be41b676553490`의 Git 복구 참조 태그는 기록 단계에서 사후 보존한다. 실제 소스·DB·이미지 복원 수단은 배포 전에 준비했다.

## 후속

CHRO가 다음 실제 출퇴근/취소·휴가/출장 승인과 직원 본인 수신을 확인하고, 월요일 주간 실제 실행을 대조한다. 실제 휴대폰 푸시/배지는 별도 수용한다. 공식 main의 이후 변경 기록 커밋과 실제 운영 코드 `c173c87`을 구분한다. 화면 증거·전체 실행 로그·최종 상태는 생성문서의 `HR_대표전용알림_운영배포_20261107`에 보관한다.
