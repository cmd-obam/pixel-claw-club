# PIXEL CLAW CLUB

우리들의 뽑기 원정대. 세 명이 초대되어 쓰는 비공개 인형뽑기 기록 서비스입니다.

이 저장소는 동작하는 Next.js 앱, 규칙 엔진, 그리고 Supabase용 SQL 마이그레이션을 포함합니다. 아래 상태는 이 환경에서 실제로 확인한 결과입니다.

## 상태

| 구분 | 상태 |
| --- | --- |
| 데모 모드 UI와 로컬 파일 저장 | 구현됨. Supabase 환경 변수가 없으면 사용됩니다. |
| 주간 예산, 랭킹, 공개 범위, 초대 정원 | 규칙 엔진 테스트로 검증됨 |
| 로컬 픽셀 변환 | Vitest에서 실행됨 |
| TypeScript, ESLint, production build | 통과 |
| Supabase 인증, RLS, 실제 세 계정 | 코드와 SQL은 있으나 이 환경에서 라이브 데이터베이스에 적용하거나 검증하지 않음 |
| 지도 타일 | 키를 넣으면 네이버 또는 카카오 스크립트를 불러옵니다. 키가 없으면 목록으로 동작합니다. |
| 전체 서비스의 운영 준비 | 아님. 라이브 권한 테스트가 남아 있습니다. |

데모 배너는 “실제 로그인이나 세 사람의 공유 저장이 아닙니다”라고 표시합니다. 데모 데이터는 `.demo-data/club.json`에만 있고 운영 API와 섞이지 않습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `/auth`를 엽니다. Supabase 변수가 없으면 멤버 A, 멤버 B, 멤버 C로 입장합니다.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 운영 저장소

`docs/configuration.md`와 `docs/deployment.md`를 따른 뒤 `.env.example`을 `.env.local`로 복사합니다. 값을 채우면 데모 입장은 꺼지고 Supabase Auth만 사용합니다.

SQL은 `supabase/migrations`에 시간 순으로 있습니다. 이 작업 환경에서는 PostgreSQL에 적용하지 않았습니다.
