# 구성

시간대는 `Asia/Seoul`, 통화는 원, 언어는 한국어입니다. 주간 예산의 기본값은 멤버당 10,000원이고, 월요일 00:00 이상 다음 월요일 00:00 미만입니다.

## 환경 변수

앱이 읽는 값은 `.env.example`에 있습니다.

- `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 모두 `https://` URL과 함께 있어야 운영 모드입니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버만 읽습니다. 첫 등록에서 내부 계정을 만들고 로그인 이메일을 찾을 때 사용합니다. 세션은 멤버가 입력한 비밀번호가 맞을 때만 만들어지며, 금액 조회나 기록 저장에는 이 키를 쓰지 않습니다. `NEXT_PUBLIC_` 이름으로 두지 않습니다.
- `NEXT_PUBLIC_MAP_PROVIDER`는 `naver`, `kakao`, `none` 중 하나입니다.
- 지도 JavaScript 키와 장소 검색 키는 별개입니다. 검색 키는 `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` 또는 `KAKAO_REST_API_KEY`이며 서버에만 둡니다.
- `IMAGE_AI_PROVIDER`가 비어 있으면 서버의 로컬 픽셀 변환만 사용합니다. AI 변환은 연결하지 않았습니다.

## 모드

운영 모드에서는 브라우저가 Supabase 세션 쿠키를 보내고, 서버는 anon 키와 사용자 JWT로 조회합니다. 금액이 있는 표는 API 역할에 권한을 주지 않고, `my_budget_dashboard`, `ranking_inputs`, `visible_record_amounts`, `save_play_record` 함수로만 다룹니다.

데모 모드에서는 `pcc_demo_user` httpOnly 쿠키와 `.demo-data` 파일만 사용합니다. 운영 변수가 있으면 데모 쿠키는 인정하지 않습니다.

## 데이터 규칙

- 방문, 플레이 기록, 시도 횟수는 서로 다른 값입니다.
- 지출은 `financial_records`에만 있습니다.
- 공개 기본값은 `PRIVATE`입니다. 인형도 그룹 공개를 직접 선택하기 전에는 비공개입니다.
- 예산 초과는 저장을 막지 않습니다. 서버가 예상 금액을 다시 계산하고, 확인 지문이 현재 합계와 같을 때만 저장합니다.
- 활성 멤버는 세 명입니다. 수락은 그룹 행 잠금 안에서 인원을 셉니다.
- 초대는 원문 대신 SHA-256 해시만 저장합니다.
- 기록 삭제 시 연결된 인형은 지우지 않고 연결만 끊습니다. 그 기록으로 완료된 복수는 `needs_review`가 됩니다.
- 마을 레벨은 현재 공개 인형 수이고, 한 번 열린 장식 단계는 수가 줄어도 유지됩니다.

## 지도

키가 없으면 홈의 첫 큰 영역은 설정 안내와 매장 목록입니다. 좌표가 없는 매장은 목록에만 있습니다. 현재 위치는 버튼을 눌렀을 때 한 번만 요청합니다.
