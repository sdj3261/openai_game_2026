# GAIA//2126 보안 검토

검토일: 2026-08-10

## 현재 공격 표면

- 정적 GitHub Pages 클라이언트이며 계정, 결제, 위치 정보와 서버 비밀을 사용하지 않는다.
- 게임 세이브는 IndexedDB, 로컬 순위는 localStorage에만 저장한다.
- 선택형 순위 API는 `VITE_LEADERBOARD_API_URL`을 설정했을 때만 활성화되며 쿠키나 인증 정보를 전송하지 않는다.
- 브라우저 Worker는 알려진 정책·사건 ID만 처리하고, 저장 데이터는 버전·길이·TypedArray·finite 값 검사를 통과해야 복구한다.

## 적용한 방어

- `.env`, 인증서·개인 키, 로컬 DB, 배포 도구 상태, 로그와 임시 산출물을 Git에서 제외한다. 공개 가능한 빈 `.env.example`만 예외다.
- CSP는 동일 출처 스크립트·Worker·에셋·네트워크 연결만 허용하며 object와 외부 form 전송을 차단한다. 향후 외부 순위 API를 쓸 때는 고정 API origin 하나만 `connect-src` allowlist에 추가하거나 같은 출처 프록시를 사용한다.
- 프로덕션 소스맵을 배포하지 않는다.
- 네트워크 순위 응답은 문자열 길이, 점수·연도·지표 범위, 전략 배열과 날짜·검증 플래그를 검사한 뒤 표시한다. React 텍스트 렌더링을 사용하며 HTML 주입 API를 사용하지 않는다.
- POST proof는 `simulationVersion`, `seed`, 매 턴의 정책·사건 선택을 포함한다. 공개 공유판의 `verified`는 서버 재실행 뒤에만 발급한다.
- GitHub Actions 권한은 `contents: read`, `pages: write`, `id-token: write`로 제한한다.
- npm audit 결과 알려진 취약점 0건, 저장소 비밀 패턴 검색 결과 0건이다.

## 남은 출시 조건

- GitHub Pages의 meta CSP는 HTTP 응답 헤더보다 제한적이다. Hive나 별도 CDN으로 옮길 때 CSP, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, HSTS를 응답 헤더로 설정한다.
- 공유 순위 API 배포 전 인증/비인증 쓰기 정책, rate limit, 요청 크기 제한, CORS allowlist, PostgreSQL 제약, 보존·삭제 정책과 재실행 검증을 구현한다.
- 외부 기후·지도 데이터를 추가할 때 라이선스, 무결성, 캐시 정책과 공급망 검토를 다시 수행한다.
- 의존성 업데이트마다 테스트·빌드와 `npm audit`을 재실행한다.

## 재현 명령

```bash
npm audit --audit-level=moderate
npm test
npm run lint
npm run build
```

비밀이나 취약점을 발견하면 공개 이슈에 값을 붙이지 말고 저장소 소유자에게 GitHub의 비공개 보안 보고 기능으로 전달한다.
