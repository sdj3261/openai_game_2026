# Security boundary

## 현재 적용된 통제

- 허용 Origin의 브라우저 요청만 CORS로 응답하며, 알 수 없는 Origin은 `403`으로 거절합니다. Origin 헤더가 없는 서버 요청은 공개 API 특성상 허용되므로 CORS를 인증 수단으로 취급하지 않습니다.
- 32 KiB 요청 제한을 `Content-Length`와 실제 stream 양쪽에서 확인합니다.
- 입력 숫자·문자열·배열·UUID·ISO 시각·시즌 seed·시나리오·액션 수를 경계에서 검증합니다.
- 현재 v1 전역 시뮬레이션을 서버에서 완전히 재실행합니다. 결과가 하나라도 다르면 `verified: false` 오류로 거절하고 D1에 쓰지 않습니다.
- 모든 SQL 값은 bind parameter로 전달합니다. callsign은 정규화 및 문자 allowlist를 통과합니다.
- 서버 ID와 서버 시각을 사용하며, `(season_id, client_submission_id)` 고유 인덱스로 정상 재시도를 멱등 처리합니다.
- Rate Limiting binding이 없거나 실패하면 쓰기 경로를 fail-closed 합니다.
- 응답은 `nosniff`, 제한적 CSP, `no-referrer`, 명시적 CORS와 캐시 정책을 사용합니다.

## 의미 있는 한계

1. 게임 규칙과 seed가 브라우저에 공개되어 있으므로 공격자는 유효한 액션 로그를 자동 생성할 수 있습니다. 현재 `verified`는 결과 무결성이지 인간성 증명이 아닙니다.
2. 익명 사용자는 새 UUID를 만들어 다시 제출할 수 있습니다. Rate limit은 스팸 비용을 높이지만 계정당 1회 제한은 아닙니다.
3. 네트워크 주소 기반 fallback rate limit은 학교·회사·이동통신망처럼 주소를 공유하는 정상 사용자에게 영향을 줄 수 있습니다. 인증 사용자가 생기면 `X-Gaia-Player-Id` 대신 검증된 계정 ID를 binding key로 사용해야 합니다.
4. Worker 규칙은 현재 브라우저 규칙의 작은 의도적 복제본입니다. golden fixture가 어긋난 배포를 막지만, 장기적으로는 같은 Rust/WASM 코어를 브라우저와 서버에서 공유하는 편이 안전합니다.

## 공개 경쟁 시즌 전 필수 강화

- Hive 또는 별도 계정 인증을 붙이고 인증된 subject를 제출 row와 rate-limit key에 저장합니다.
- `GET /season/challenge`에서 짧게 만료되는 단회 nonce와 허용 seed를 발급하고 서버 비밀키로 서명합니다.
- proof에 challenge ID를 포함하고 D1 transaction으로 한 번만 소비합니다. 만료·재사용·다른 계정 사용은 거절합니다.
- 계정별 시즌 제출 정책, 관리자 삭제/비공개 처리, 보존 기간과 개인정보 고지를 확정합니다.
- 고가치 시즌에는 Turnstile 또는 동등한 봇 완화, Cloudflare WAF 규칙, 이상 제출 알림을 추가합니다.
- D1 Time Travel/백업 복구 절차와 Worker 버전 rollback을 실제 staging에서 연습합니다.

보안 문제를 발견하면 공개 이슈에 proof나 공격 payload를 올리지 말고 저장소 소유자에게 비공개로 전달해야 합니다.
