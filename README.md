# GAIA//2126: 살아있는 지구

**정책을 고르면, 사람들이 움직이고 도시의 운명이 바뀐다.**

[브라우저에서 바로 플레이](https://sdj3261.github.io/openai_game_2026/) · [게임 디자인](./docs/GAME_DESIGN.md) · [기술 아키텍처](./docs/TECHNICAL_ARCHITECTURE.md) · [시스템 디자인 DOCX](./docs/GAIA_2126_SYSTEM_DESIGN.docx) · [보안 검토](./docs/SECURITY_REVIEW.md) · [Codex 협업 기록](./docs/CODEX_COLLABORATION.md) · [제출/시연 자료](./docs/SUBMISSION.md)

GAIA//2126은 뜨거워진 2026년부터 2126년까지 지구 문명을 운영하는 웹 전략 게임입니다. 정책 하나가 기후·식량·물·경제를 흔들고, 청년·생산연령·고령 인구 코호트의 이동과 도시의 성장 또는 붕괴로 이어집니다. 숫자로 계산한 결과는 살아 움직이는 3D 전략 지구에 이주 경로, 도시 불빛과 재난으로 나타납니다.

설치, 계정, 백엔드 없이 최신 데스크톱 브라우저에서 바로 한 판을 플레이할 수 있도록 설계했습니다.

## 플레이 방법

한 턴은 5년입니다. 20턴 동안 지구 평균기온뿐 아니라 자연과 시민의 신뢰도 함께 지켜야 합니다.

1. 지구를 돌리거나 국가를 검색해 현재 위험을 확인합니다.
2. 예산 안에서 정책을 최대 2개 선택합니다.
3. 이번 세계 사건의 선택지 하나를 결정합니다.
4. `5년 진행`을 눌러 결과를 확인합니다.
5. 달라진 기온·배출·물·식량·이주 경로와 도시 상태를 보고 다음 전략을 바꿉니다.

2126년에 도달하면 기온, 자연, 신뢰, 회복력과 배출 경로를 종합한 결말을 받습니다. 신뢰 또는 자연 기반이 먼저 무너지면 행성 운영은 그 전에 종료됩니다.

### 조작

- 드래그: 지구 회전
- 휠/트랙패드: 확대·축소
- 국가 검색/선택: 해당 지역 전망과 위험 표시
- 정책 카드: 최대 2개 조합
- 사건 카드: 선택지 1개 결정
- `5년 진행`: 다음 턴
- 초기화: 로컬 자동 저장을 지우고 2026년부터 다시 시작

권장 환경은 최신 Chrome 또는 Edge 데스크톱 브라우저입니다. WebGPU를 우선 사용하고, 사용할 수 없는 환경에서는 WebGL2로 전환합니다.

## 코어 시스템

```text
정책
  → 배출 · 자연 · 신뢰 · 경제 · 회복력
  → 기온 · 재난 · 물 · 식량 · 주거비
  → 거주 가능성 · 코호트 이주
  → 도시 성장 · 긴장 · 붕괴
  → 다음 턴의 새로운 선택 조건
```

- **행성 운영:** 2026–2126년을 5년 단위로 진행
- **정책 자유도:** 감축, 적응, 자연, 정의를 아우르는 13개 정책의 조합과 기회비용
- **셀 시뮬레이션:** 5,000개 지구 셀의 환경·인구·경제 상태 계산
- **인구 코호트:** 개인 수십만 명 대신 이동 성향이 다른 연령 집단을 계산
- **살아 있는 지구:** 대표 이주 아크, 성장/붕괴 도시, 재난과 생태 변화를 3D로 압축 표현
- **국가 전망:** 국가를 찾아 같은 지구 경로가 지역마다 만드는 다른 위험을 비교
- **자동 저장:** IndexedDB에 현재 세계를 저장하고 새로고침 후 복구
- **다중 결말:** 단순한 온도 점수가 아니라 생태·신뢰·회복력을 함께 평가
- **최종 대시보드:** 생존 연도 → 종합 점수 순위와 최종 기온·자연·신뢰·회복력, 상위 투자 정책 태그

현재 공개 빌드의 순위표는 **`LOCAL DEMO`**입니다. 내장 샘플과 이 브라우저의 과거 완료 기록을 `localStorage`에서 비교하며, 라이브 공유 백엔드나 실시간 Hive 사용자를 표시하지 않습니다.

## 기술 구조

```text
React UI ─────── Zustand ─────── Babylon.js
                        │
                        ▼
                  Dedicated Worker
                        │
      Float32Array / Uint8Array 세계 상태
                        │
                        ▼
                  IndexedDB autosave
```

| 영역 | 기술 |
|---|---|
| App | React 19, TypeScript, Vite |
| UI style | Tailwind CSS |
| State | Zustand |
| 3D | Babylon.js, WebGPU → WebGL2 fallback |
| Simulation | Dedicated Web Worker |
| World data | TypedArray / transferable ArrayBuffer |
| Save | IndexedDB |
| Result board | localStorage fallback, optional REST `GET/POST /leaderboard` |
| Test | Vitest |

시뮬레이션은 UI 스레드와 분리합니다. Worker가 정책 → 기후 → 자원 → 이주 → 도시 상태를 계산하고, React와 Babylon.js는 같은 스냅샷을 대시보드와 3D 장면으로 표현합니다. 자세한 설계와 20,000셀·100,000셀 확장 계획은 [기술 아키텍처](./docs/TECHNICAL_ARCHITECTURE.md)에 있습니다.

## 로컬 실행

### 요구 사항

- Node.js 20.19+ 또는 22.12+
- npm
- WebGL2를 지원하는 현대 브라우저

### 설치와 개발 서버

```bash
git clone https://github.com/sdj3261/openai_game_2026.git
cd openai_game_2026
npm ci
npm run dev
```

터미널에 표시되는 로컬 URL을 엽니다. Vite 개발 서버의 기본 주소는 일반적으로 `http://localhost:5173/openai_game_2026/`입니다.

### 검증

```bash
npm test
npm run lint
npm run build
```

프로덕션 빌드는 `dist/`에 생성됩니다.

```bash
npm run preview
```

`preview`는 빌드 결과의 로컬 확인용이며 운영 서버로 사용하지 않습니다.

### 선택형 공유 순위표 설정

기본 `.env.example`의 URL은 비어 있으며 이 상태가 심사 빌드의 `LOCAL DEMO` 모드입니다.

```dotenv
VITE_LEADERBOARD_API_URL=
```

향후 공유 서비스가 실제 배포된 뒤에만 base URL을 설정합니다. 클라이언트는 `${VITE_LEADERBOARD_API_URL}/leaderboard`에 `GET`과 `POST`를 보내며, 실패하면 완주 기록을 잃지 않고 로컬 보드로 돌아갑니다. 현재 저장소에는 라이브 공유 백엔드가 포함되거나 배포되어 있지 않습니다. 서버 재실행 검증 계약은 [기술 아키텍처](./docs/TECHNICAL_ARCHITECTURE.md#10-최종-대시보드와-리더보드-계약)를 참고하세요.

## GitHub Pages 배포

Vite base path는 저장소 이름에 맞춰 `/openai_game_2026/`로 설정되어 있습니다. `main` 브랜치에 push하면 GitHub Actions가 의존성 설치, 테스트, 빌드와 Pages 배포를 수행하도록 구성합니다.

저장소 설정:

1. GitHub 저장소의 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. `main`에 push하고 Actions의 배포 완료를 확인합니다.
4. [플레이 링크](https://sdj3261.github.io/openai_game_2026/)를 로그아웃/시크릿 창에서 엽니다.

수동으로 다른 정적 호스트에 배포하려면 `npm run build` 후 `dist/`의 내용을 서비스합니다. 다른 base path를 사용할 경우 `vite.config.ts`의 `base`도 함께 변경해야 합니다.

### 배포 스모크 테스트

- 캐시 없는 첫 방문에서 시작 화면이 보이는가?
- 정책과 사건을 선택해 첫 턴을 끝낼 수 있는가?
- Worker와 모든 정적 자산 요청이 404 없이 성공하는가?
- 새로고침 후 IndexedDB 저장이 복구되는가?
- WebGPU 비활성 환경에서 WebGL2로 플레이 가능한가?
- 20턴 뒤 결말과 다시 시작이 동작하는가?

## 챌린지 신규 개발과 Codex 협업

이 저장소는 구현된 기존 게임 없이 시작했습니다. 게임 코드, 시뮬레이션, 3D/UI, 정책·사건 콘텐츠, 디자인 문서, 테스트와 배포 설정은 챌린지 기간에 새로 개발했습니다.

제작자는 기후 문명 타이쿤이라는 문제 정의, 정책이 인간 이동과 도시를 바꾸는 핵심 경험, population cohort 원칙과 기술 방향을 정했습니다. Codex는 이를 실행 가능한 루프와 타입으로 분해하고, 시뮬레이션·3D/UI·문서·검증 트랙을 병렬화해 구현과 검증을 도왔습니다. 역할과 증거는 [Codex Collaboration 기록](./docs/CODEX_COLLABORATION.md)에 정리했습니다.

## 과학 모델 고지

GAIA//2126은 **과학적 영감을 받은 전략 게임이며 실제 기후 예측, 정책 평가, 투자 또는 안전 계획 도구가 아닙니다.**

- 게임은 인간 활동에 따른 온난화, 극한 현상, 물·식량·생태계와 사회 위험의 연결이라는 과학적 방향을 참고합니다.
- 전 지구 시작 온도 `+1.48°C`는 WMO가 발표한 2023–2025년 통합 3년 평균을 출발점으로 사용합니다. 이는 공식 2026년 관측값을 뜻하지 않습니다.
- 국가별 위험, 미래 해수면·폭염일·이주 규모와 정책 효과 계수는 재미와 시스템 가독성을 위해 단순화한 게임 시나리오 값입니다.
- 단일 연도의 산업화 이전 대비 1.5°C 초과와 수십 년 장기 평균의 1.5°C 임계값 초과는 같은 의미가 아닙니다.
- 특정 국가·도시의 결과는 확정적 미래가 아니며 실제 의사결정에 사용하면 안 됩니다.

WMO는 2025년이 관측 사상 가장 더운 세 해 중 하나였고, 2023–2025년 통합 평균이 1850–1900 평균보다 `1.48 ± 0.13°C` 높았다고 발표했습니다. 그러나 3년 평균도 파리협정에서 말하는 수십 년 장기 온난화 수준과 동일하지 않습니다. 이 구분은 게임의 “이미 뜨거워진 시작점”을 설명할 때도 유지합니다.

### 참고 자료

- [IPCC — Climate Change 2023: AR6 Synthesis Report](https://www.ipcc.ch/report/ar6/syr/)
- [WMO — 2025 was one of the warmest years on record](https://wmo.int/news/media-centre/wmo-confirms-2025-was-one-of-warmest-years-record)
- [WMO — State of the Global Climate 2025](https://wmo.int/publication-series/state-of-global-climate/state-of-global-climate-2025)
- [NASA — Evidence for Climate Change](https://science.nasa.gov/climate-change/evidence/)

위 기관은 본 게임을 보증하거나 게임 내 계수를 제공하지 않았습니다.

## 프로젝트 문서

- [GAME_DESIGN.md](./docs/GAME_DESIGN.md) — 전체 게임 루프, 시스템, 코호트, 3D/아이콘 방향, MVP 범위
- [TECHNICAL_ARCHITECTURE.md](./docs/TECHNICAL_ARCHITECTURE.md) — React/Babylon/Worker/TypedArray/IndexedDB와 확장 로드맵
- [CODEX_COLLABORATION.md](./docs/CODEX_COLLABORATION.md) — 신규 개발 범위, 사람/Codex 역할과 병렬 협업 방식
- [SUBMISSION.md](./docs/SUBMISSION.md) — 최종 제목, 200자 소개, 심사 기준 대응, 3분 시연 스크립트

## 로드맵

1. **Challenge MVP — 5,000셀:** 코어 연쇄, 3D 지구, 국가 전망, 자동 저장, 완결된 100년
2. **Release — 20,000셀:** 더 많은 국가·도시, 재난 공간 전파, 정책 트리, 시나리오
3. **Scale — 100,000셀:** 기온·습도·오염·식생의 WebGPU Compute, CPU 폴백
4. **필요할 때 Rust/WASM:** 프로파일링으로 확인된 경로 탐색과 대형 계산만 이식
5. **Hive 확장:** Go의 선택 로그 재실행 검증 + PostgreSQL verified run, 주간 동일 시드 챌린지, 공동 목표, 결과 공유
6. **규모가 요구할 때:** Redis 상위 순위/시즌 집계 캐시와 rate limit 공유

---

**가장 낮은 온도만이 정답은 아닙니다. 가장 살 만하고 공정한 2126년을 남겨보세요.**
