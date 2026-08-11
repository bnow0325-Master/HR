# 로컬에서 관리하기

BNOW HR의 로컬 기준 경로는 `D:\project\hr`입니다.

## 최초 설치

Node.js 22와 Git을 설치한 뒤 다음 명령을 실행합니다.

```powershell
Set-Location D:\project
git clone https://github.com/bnow0325-Master/HR.git hr
Set-Location D:\project\hr
npm ci
```

## 환경설정

`.env.example`을 참고해 `.env` 또는 `.env.production.local`을 준비합니다.

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `EMPLOYEE_DIRECTORY_API_TOKEN`
- `OFFICE_LATITUDE`, `OFFICE_LONGITUDE`, `OFFICE_RADIUS_METERS`
- `QR_TOTP_SECRET`, `QR_STEP_SECONDS`

환경파일은 Git에서 제외되며 GitHub에 올리지 않습니다.

## 개발

```powershell
Set-Location D:\project\hr
git switch main
git pull --ff-only
npm run dev
```

로컬 주소는 `http://127.0.0.1:3000/attendance`입니다. 다른 개발 서버가 3000번
포트를 사용하면 Next.js가 다음 빈 포트를 선택합니다.

## 검사와 반영

```powershell
npm run check
git switch -c codex/<작업명>
git add <변경파일>
git commit -m "<type>(<scope>): <subject>"
git push -u origin codex/<작업명>
```

GitHub PR 검증을 통과한 뒤 `main`에 병합합니다. 운영 반영은 자체 서버 배포 절차를
사용합니다.

## 기준 문서

- 개발 규칙: [AGENTS.md](./AGENTS.md)
- 배포: [deploy/README.md](./deploy/README.md)
- 운영 요약: [DEPLOY.md](./DEPLOY.md)
