# HR 알림 배포 사전점검과 준비 환경 재사용

대표의 기존 직접 배포 지시는 정상 사전점검·백업·복원 검증을 포함한다. 같은 배포 승인을 다시 요청하지 않고 기존 Alpacon 운영자 경로를 확인했다. 새 계정·sudo 정책을 만들지 않았다. 운영 서버의 변경은 아래 감사용 파일 작성뿐이며 앱/DB/발송 변경은 아직 없다.

## 실제 운영 확인

- WorkSession: `9b20b0ae-23ba-41b6-bdb1-a0143fc359ca`, 기본 계정 `elonchoo`, 기존 sudo baseline, verified-file 실행.
- `/home/elonchoo/hr-notifications-preflight-9b5b7cf-20261107.sh` SHA256 `5e7c7012dad35b4f43625f9ef97f5838b3a00d01dd3582fdb1b0919fdcefef2b`, command `ebc991ac-ed34-4a4b-9f0f-ce0132e831f1`, exit 0.
- 실제 앱 Compose 프로젝트 `bnow-checkinout`, working_dir `/opt/bnow/hr-releases/09a032d-20261103-trial-access`.
- 실행 이미지 `sha256:477deb5e0a63e140ec15be03e902ff2d58b0c08224605294e441cba52589e25b`, 앱/전용 DB healthy, 공개 `/check` 200.
- `/opt/bnow/hr/current`의 `66869b0` 링크를 실제 운영으로 확정하지 않는다.
- 실제 앱에는 유효한 HR 직원채팅 webhook URL이 없다. 최초 배포 스크립트의 설정 검증에서 중단되는 조건이 확인됐다.

## HR 준비 설정 확인

- `/home/elonchoo/hr-prepared-env-metadata-20261107.py.sh`, command `853c7063-9cd6-49de-a12c-9e0f897ce3b4`, exit 0.
- 정확한 HR 준비 환경 경로는 `/opt/bnow/hr/releases/66869b0-approval-notifications/.env.production.local`이다. 해당 HR 파일의 설정 존재 여부와 host/path만 조회했다. 기존 목적지는 HTTPS `main.bnow.co.kr/api/staff-chat/webhooks/incoming`, 연동 자격정보 구성 여부 true였다. 값은 읽기 결과나 문서·로컬 파일에 출력하지 않았다.
- 정규 채팅 API에 빈 JSON을 요청하려던 별도 파일 `/home/elonchoo/hr-chat-auth-schema-probe-20261107.sh`는 플랫폼이 `command_inline_credential`로 반려했다. 런타임 파일에서 토큰을 읽는 코드였지만 재시도하거나 다른 명령으로 같은 검증을 실행하지 않았다. 그 요청은 실행되지 않았고 발송도 없다.
- 후속 검증은 새 HR 앱의 고정된 대표 전용 연결 확인 기능으로 수행한다. 이 기능은 신청자 지정 수신자·본문을 받지 않고, 실제 HR 원장을 만들지 않는다. 채팅 저장/방 ID/메시지 번호와 실제 화면을 대조한다.

## 배포 보완

`prepare-env.py`를 추가했다. 이전 앱의 환경을 새 릴리스로 복사한 다음, 기존 HR 연동 설정이 없으면 위의 정확한 HR 준비 파일에서 연동 설정만 재사용한다. 외부 host, 다른 API 경로, userinfo/query, placeholder/제어문자 자격정보를 거절하고 새 릴리스에만 정규 비노우톡 목적지를 저장한다. 이전 앱과 준비 파일은 변경하지 않는다. 거부된 비노우톡 환경파일을 다시 읽지 않는다. 새 cron 토큰은 서버에서 생성하고 출력하지 않는다.

로컬 준비 환경 테스트 5건 및 배포 bash 구문 검사를 통과했다. PR #114의 main `9b5b7cf`와 실제 DB 포함 알림 38건·타입·빌드 CI 성공은 기존 근거로 재사용한다. 이 보완의 CI·최신 main 병합과 전체 archive를 확인한 뒤 백업·격리복원·전환을 진행한다. 아직 운영 배포·대표 연결 확인·기기 수신 완료를 보고하지 않는다.

## 감사와 복원

작성한 감사 스크립트는 현재 서비스에서 참조하지 않는 사용자 홈의 일반 파일이다. 고객 원장/서비스 변경은 없다. 실제 배포 시 별도 코드·DB 백업과 즉시 코드 복원 파일을 만들며, 이후 HR 원장과 outbox를 과거 덤프로 덮어쓰지 않는다.
