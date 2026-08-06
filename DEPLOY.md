# 배포 가이드 — Vercel + Neon (무료)

회사 PC 브라우저에서 위치 확인을 쓰려면 **HTTPS 주소**가 필요합니다.
아래 순서대로 하면 무료로 배포할 수 있습니다. (약 10~15분)

> 왜 Postgres인가: Vercel은 서버리스라 파일(SQLite)을 저장할 수 없습니다. 그래서
> 클라우드 DB인 **Neon(PostgreSQL)** 을 씁니다. 코드는 이미 Postgres용으로 준비돼
> 있습니다.

---

## ✅ 빠른 체크리스트

따라 하며 하나씩 체크하세요. 각 항목의 자세한 설명은 아래 섹션에 있습니다.

**0. 비밀값 준비** — `ADMIN_PASSWORD`(로그인 비번)는 강한 값으로 직접 정하기.

**1. Neon DB**
- [ ] neon.tech GitHub 로그인 → 프로젝트 `checkinout` 생성 (Region: Singapore 권장)
- [ ] **Connection string**(`postgresql://...`) 복사 → `DATABASE_URL`

**2. Vercel 배포**
- [ ] vercel.com GitHub 로그인 → Add New → Project → `checkinout` **Import**
- [ ] Framework = **Next.js** 확인
- [ ] 환경변수 5개 입력: `DATABASE_URL`, `ADMIN_PASSWORD`,
      `OFFICE_LATITUDE`(37.5636), `OFFICE_LONGITUDE`(126.9868), `OFFICE_RADIUS_METERS`(150)
- [ ] **Deploy** (빌드 시 DB 마이그레이션 자동 적용) → 배포 주소 확인

**3. 관리자 & 직원 등록**
- [ ] `배포주소/admin` 로그인(`ADMIN_PASSWORD`) → **직원 관리**에서 직원·PIN 추가

**4. 실제 확인 (폰)**
- [ ] 회사 PC에서 `배포주소/check` → 이름·PIN·위치 확인 → 출근
- [ ] `배포주소/admin` 에서 기록이 **✓ 현장확인** 으로 보이는지 확인
- [ ] 사무실 밖에서 시도 → **차단**되는지 확인

**5. 좌표 보정 (권장)**
- [ ] 실제 사무실에서 위도·경도 확인 → Vercel 환경변수 수정 → **Redeploy**

---

## 1) Neon에서 무료 데이터베이스 만들기

1. https://neon.tech 접속 → **GitHub로 로그인**
2. **Create project** → 이름 `checkinout`, Region은 `Asia (Singapore)` 등 가까운 곳
3. 생성되면 **Connection string**이 보입니다. `postgresql://...` 전체를 복사해 두세요.
   - `?sslmode=require`가 붙은 형태면 그대로 사용합니다.

## 2) Vercel에 배포하기

1. https://vercel.com 접속 → **GitHub로 로그인**
2. **Add New → Project** → `bnow0325-Master/checkinout` 레포 **Import**
3. Framework는 **Next.js**로 자동 인식됩니다. **Environment Variables**에 아래 5개 추가:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | (1)에서 복사한 Neon 연결 문자열 |
   | `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 (강력하게) |
   | `OFFICE_LATITUDE` | `37.5636` (실제 사무실 좌표로 보정 권장) |
   | `OFFICE_LONGITUDE` | `126.9868` |
   | `OFFICE_RADIUS_METERS` | `150` |
4. **Deploy** 클릭.
   - 빌드 시 `vercel-build` 스크립트가 **DB 마이그레이션(`prisma migrate deploy`)을 자동 적용**한 뒤 앱을 빌드합니다. 별도 작업 필요 없음.

## 3) 직원 등록 (관리자 화면에서)

배포된 주소에서 `/admin` 으로 접속 → `ADMIN_PASSWORD`로 로그인 → **직원 관리**에서
사번·이름·부서·PIN을 입력해 직원을 추가합니다. (별도 명령·seed 불필요)

> 여러 명을 한 번에 넣고 싶다면 내 컴퓨터에서 `prisma/seed.ts` 목록을 수정한 뒤
> `DATABASE_URL`을 Neon 문자열로 설정하고 `npm run db:seed` 를 실행해도 됩니다.

## 4) 사용하기

- 배포된 주소(예: `https://checkinout.vercel.app`)를 폰에서 엽니다.
- **직원**: 회사 PC에서 접속 → 이름 선택 → PIN 입력 → 위치 확인 → 출근/퇴근.
- **관리자**: `/admin` 에서 오늘/주간/월간/연간 집계 및 CSV 내려받기.

> HTTPS 주소이므로 위치 권한이 정상 동작합니다. (localhost 외 http에서는 차단됨)

---

## 참고

- **좌표 보정**: 배포 후 실제 사무실 6층/입구에서 폰 지도앱으로 위도·경도를 확인해
  `OFFICE_LATITUDE/LONGITUDE`를 업데이트하면 정확도가 올라갑니다. 반경(150m)은 오차
  흡수용이니 필요시 조정하세요.
- **스키마 변경 시**: 로컬에서 `npx prisma migrate dev --name <설명>` 으로 마이그레이션을
  만들어 커밋하면, 다음 배포에서 자동 적용됩니다.
- **비용**: Neon·Vercel 모두 개인/소규모는 무료 티어로 충분합니다.
