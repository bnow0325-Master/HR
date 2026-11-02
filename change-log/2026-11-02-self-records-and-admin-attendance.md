# 2026-11-02 개인·관리자 출퇴근 기록 배포

- 저장소: `bnow0325-Master/HR`
- 기능 PR: #108, 로그인 경로 수정 PR: #109 (CI validate 통과)
- 최종 소스 커밋: `b88c697ed300fb5d31f2daeda085c55fe76743e3`
- 배포 ID: `b88c697-20261102-attendance-sso`
- 운영 릴리스: `/opt/bnow/hr-releases/b88c697-20261102-attendance-sso`
- 운영 앱 이미지: `sha256:8e6ead7f2e4014d7a3f02c23d7b6c7db292e3f019049558c62b9cfc19d1e71f0`
- 운영 URL: <https://hr.bnow.co.kr/records>, <https://hr.bnow.co.kr/admin/attendance-records>
- Alpacon 배포 작업 세션: `4ee30c99-1a2a-4c19-a094-168aafff2b90`

## 변경과 검증

직원은 본인의 월별 날짜·출근·퇴근 기록을 확인하고, 관리자는 직원과 월 또는 기간을 선택해 실제 HR·네이버웍스 이관·승인 휴가/출장 기록을 확인한다. 출퇴근 시각이 없는 날은 무단결근으로 판정하지 않는다. 중복 출근 기록으로 퇴근을 생성하지 않는다. `/records`의 재로그인 반복을 제거하고 WorkBoard·회사 로그인 이동 경로에 새 화면을 추가했다. DB 스키마 변경과 마이그레이션은 없다.

로컬 HR `npm run check`와 identity 24건, 출퇴근 집계 9건을 통과했다. PR #108·#109의 CI validate가 통과했다. 운영 Docker 빌드와 TypeScript 검사가 성공했고 컨테이너가 healthy다. 인증된 우측 패널 브라우저에서 개인 `/records?month=2026-11`이 본인 30일 기록으로 열리며, 관리자 `/admin/attendance-records?month=2026-11`에서 직원 필터·월 이동·CSV 링크와 당일 실제 기록을 확인했다. 직원 비관리자 계정으로의 화면 검증과 실제 모바일 기기 확인은 아직 수행하지 않았다.

## 배포·백업·복원

첫 릴리스 `36ee7b1-20261102-attendance` 이후 로그인 경로 수정 릴리스를 배포했다. 최종 소스 묶음 `hr-b88c697.tar.gz` SHA-256 `a1dfdf160b653c3f3e90398ae121773c5540197326a8fe34c84030d3196e31c9`를 서버로 전송하고 실행 스크립트가 같은 해시를 확인했다. 이전 릴리스 전체 백업 및 복원 스크립트는 `/home/elonchoo/deploy-backups/hr-attendance-sso-20261102/`에 있다. 앱 롤백은 해당 폴더의 `rollback.sh`를 root로 실행하고 `bnow-checkinout-app-1`의 healthy 상태와 두 운영 URL을 다시 확인한다. DB 변경이 없으므로 이번 앱 롤백에 DB 복원은 필요하지 않다.
