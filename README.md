# PIXEL CLAW CLUB

PIXEL CLAW CLUB은 세 명의 친구가 함께 이용하는 인형뽑기 기록 및 게임형 웹사이트이다. 부제는 우리들의 뽑기 원정대이다.

이 저장소는 동작하는 Next.js 앱, 규칙 엔진, 그리고 Supabase용 SQL 마이그레이션을 포함한다. 아래 상태는 이 환경에서 실제로 확인한 결과이다.

## 상태

| 구분 | 상태 |
| --- | --- |
| 데모 모드 UI와 로컬 파일 저장 | 구현됨. Supabase 환경 변수가 없으면 사용된다. |
| 주간 예산, 랭킹, 공개 범위, 초대 정원 | 규칙 엔진 테스트로 검증됨 |
| 로컬 픽셀 변환 | Vitest에서 실행됨 |
| TypeScript, ESLint, production build | 통과 |
| Supabase 인증, RLS, 실제 세 계정 | 코드와 SQL은 있으나 이 환경에서 라이브 데이터베이스에 적용하거나 검증하지 않음 |
| 지도 타일 | 키를 넣으면 네이버 또는 카카오 스크립트를 불러온다. 키가 없으면 목록으로 동작한다. |
| 전체 서비스의 운영 준비 | 아님. 라이브 권한 테스트가 남아 있다. |

데모 배너는 “실제 로그인이나 세 사람의 공유 저장이 아닙니다”라고 표시한다. 데모 데이터는 `.demo-data/club.json`에만 있고 운영 API와 섞이지 않는다.

## 핵심 기능

구현되어 로컬 데모 또는 코드로 확인할 수 있는 기능이다.

- 뽑기방 지도 영역과 저장된 매장 검색. 지도 키가 없으면 목록으로 동작한다.
- 방문, 시도, 성공, 실패를 구분하는 플레이 기록
- 인형 사진 업로드, 로컬 픽셀 변환, 도감
- 이번 주, 이번 달, 전체의 3인 랭킹
- 각자 주간 10,000원 예산과 초과 시 서버 재확인
- 항목별 금액 공개 및 비공개
- 실패 매장 복수 리스트
- 공개 인형을 기준으로 한 픽셀 마을 캔버스

완료로 적지 않는 항목이다.

- 라이브 Supabase 인증, RLS, 저장소 정책 검증
- 네이버 또는 카카오 실제 타일과 장소 검색. 키를 넣기 전에는 호출하지 않는다.
- 마을 실시간 동기화. 화면은 새로고침으로 다시 읽는다.
- 운영 환경의 기록 금액 수정 RPC
- 인형뽑기 기계 미니게임. 화면에는 “인형뽑기 기계 — 추후 업데이트”만 있다.
- Vercel 자동 배포. 저장소만 연결되어 있고 배포 프로젝트는 만들지 않았다.

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4
- Zod, React Hook Form
- Supabase Auth, PostgreSQL, Storage, RLS
- 네이버 지도 또는 카카오 지도 중 하나
- HTML Canvas
- Vitest, Playwright
- 서버 이미지 처리: sharp

## 설치와 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000/auth 를 연다. Supabase 변수가 없으면 멤버 A, 멤버 B, 멤버 C로 입장한다.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 환경변수

이름은 `.env.example`에 있다. 값은 비어 있으며 비밀키는 없다. `.env.local`에 복사한 뒤 채운다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`는 선택 사항이며 앱 코드는 읽지 않는다.
- `NEXT_PUBLIC_MAP_PROVIDER`
- `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- `NAVER_SEARCH_CLIENT_ID`
- `NAVER_SEARCH_CLIENT_SECRET`
- `KAKAO_REST_API_KEY`
- `IMAGE_AI_PROVIDER`
- `IMAGE_AI_API_KEY`

자세한 의미는 `docs/configuration.md`, 배포 순서는 `docs/deployment.md`에 있다.

## 폴더

```text
src/app        화면과 서버 액션
src/components 지도, 기록 폼, 마을 캔버스
src/domain     시간, 예산, 랭킹, 마을 규칙
src/server     데모 엔진과 Supabase 경계
supabase/migrations  운영용 SQL
tests          규칙과 엔진 테스트
e2e            데모 브라우저 테스트
docs           구조, 설정, 배포 설명
```

SQL은 `supabase/migrations`에 시간 순으로 있다. 이 작업 환경에서는 PostgreSQL에 적용하지 않았다.
