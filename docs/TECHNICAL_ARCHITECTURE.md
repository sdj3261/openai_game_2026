# GAIA//2126 기술 아키텍처

## 1. 목표와 제약

GAIA//2126은 별도 설치와 로그인 없이 심사 링크에서 바로 실행되는 웹 게임이다. 아키텍처의 우선순위는 다음과 같다.

1. **Playability** — 보편적인 데스크톱 브라우저에서 안정적으로 시작되고 한 판을 끝낼 수 있다.
2. **반응성** — 시뮬레이션 계산 중에도 3D 지구와 UI 입력이 멈추지 않는다.
3. **결정론** — 같은 상태와 선택은 같은 결과를 내 테스트와 밸런싱이 가능하다.
4. **가시성** — 정책에서 이주·도시 변화까지의 인과를 UI와 3D가 같은 상태로 표현한다.
5. **확장성** — 5,000셀 MVP를 버리지 않고 20,000셀, 이후 100,000셀 GPU 계산으로 확장한다.
6. **정적 코어** — Challenge 플레이는 선택형 순위 API가 중단되어도 끝까지 동작한다.

## 2. 기술 스택

| 계층 | 기술 | 역할 |
|---|---|---|
| App/UI | React 19, TypeScript, Vite | 대시보드, 정책/사건 입력, 결과 화면, 빌드 |
| Styling | 프로젝트 CSS 디자인 시스템 | 운영실형 레이아웃, 상태·반응형·접근성 토큰 |
| State | Zustand | UI와 렌더러가 공유하는 최소 게임 상태 |
| 3D | Babylon.js | 지구, 인스턴스, 카메라, 파티클, 후처리 |
| Graphics backend | WebGPU 우선, WebGL2 폴백 | 지원 환경에서 최신 GPU 경로, 그 외 안정 경로 |
| Simulation | Web Worker | 메인 스레드와 분리된 턴 계산 |
| Data layout | `Float32Array`, `Uint8Array` 등 | 연속 메모리, 낮은 GC 부담, 전송 가능한 버퍼 |
| Save | IndexedDB | 계정 없는 로컬 자동 저장 |
| Test | Vitest | 공식, 경계값, 결정론, 저장 형식 회귀 테스트 |
| Later | Rust + WebAssembly | 검증된 무거운 CPU 커널만 선택 이식 |
| Optional leaderboard API | Cloudflare Worker + D1 | 전체 v1 선택 로그 재실행, verified run 저장·조회 |
| Later scale option | Go/PostgreSQL, Redis | D1의 측정된 운영 한계를 넘을 때만 검토 |

## 3. 런타임 구조

```text
Browser Main Thread
┌───────────────────────────────────────────────────────────┐
│ React 19 UI                                               │
│ 정책 · 사건 · HUD · 국가 검색 · 결과                      │
│                  │                                        │
│                  ▼                                        │
│ Zustand Store ◀──────▶ Babylon.js Scene                  │
│ 전역 요약/선택/상태      지구/도시/재난/이주 시각화        │
│                  │                                        │
└──────────────────┼────────────────────────────────────────┘
                   │ typed message + transferable buffers
                   ▼
Dedicated Web Worker
┌───────────────────────────────────────────────────────────┐
│ EARTH SIMULATION                                          │
│ 기후 → 물/식량/경제 → 거주 가능성 → 코호트 이주 → 도시   │
│                                                           │
│ Struct of Arrays                                          │
│ temperature[] population[] food[] water[] economy[] ...  │
└──────────────────┬────────────────────────────────────────┘
                   │ snapshot / summary
                   ▼
IndexedDB autosave

Optional, separately deployed
Browser ── GET/POST /leaderboard ── Cloudflare Worker ── D1
          failure/URL 없음 → localStorage `LOCAL DEMO`
```

핵심 규칙은 **React가 시뮬레이션하지 않고 Babylon.js가 게임 규칙을 결정하지 않는다**는 것이다. Worker가 진실의 원천인 세계 상태를 계산하고, Zustand는 화면에 필요한 스냅샷과 입력 상태를 조정한다.

## 4. 메인 스레드

### 4.1 React

React가 담당하는 영역:

- 시작/온보딩과 게임 종료
- 행성 지표 HUD
- 정책 선택, 비용 검증 결과, 세계 사건 선택
- 국가 검색과 전망 패널
- 접근성 텍스트, 툴팁, 오류/저장 상태

React가 매 프레임 3D 오브젝트를 갱신하지 않는다. 턴이 끝났을 때만 큰 상태를 반영하고, 프레임 단위 애니메이션은 Babylon.js 장면 내부에서 보간한다.

### 4.2 Zustand

스토어는 다음 두 종류를 분리한다.

- **도메인 스냅샷**: 연도, 기온, 배출, 세계 셀 스냅샷, 이주 요약
- **UI 상태**: 선택 정책, 사건 선택, 선택 국가, 로딩, 음소거, 오류

권장 액션 흐름:

```text
initialize → Worker INIT → READY → render
togglePolicy / chooseEvent → local UI state only
advance → busy=true → Worker STEP → STATE → busy=false → autosave
reset → IndexedDB clear → Worker RESET → READY
```

React 컴포넌트가 배열을 직접 수정하지 않도록 한다. Worker에서 받은 스냅샷은 한 턴 동안 읽기 전용으로 취급한다.

## 5. Babylon.js 렌더링

### 5.1 엔진 선택

초기화 시 `WebGPUEngine.IsSupportedAsync`를 확인한다.

```text
WebGPU 지원 + 초기화 성공
  → Babylon WebGPUEngine
그 외 또는 초기화 실패
  → Babylon Engine(WebGL2)
```

WebGPU는 필수 조건이 아니다. **게임 로직과 콘텐츠는 두 경로에서 동일**해야 하며, 차이는 그래픽 품질과 향후 계산 가속뿐이다. 엔진 초기화 실패 시 사용자에게 브라우저 업데이트 안내를 보여주고, 가능한 경우 저품질 프리셋으로 다시 시도한다.

### 5.2 장면 구성

- 지구 본체: 구체 기반 저폴리/복셀 스타일
- 셀/도시: thin instances 또는 인스턴싱으로 draw call 제한
- 대기: Back-face sphere 또는 후처리 림
- 도시 불빛: emissive 인스턴스와 상태별 색/밝기
- 이주 경로: 상위 N개 아크 라인 + 흐르는 입자
- 재난: 셀별 대표 파티클/데칼만 생성
- 국가 포커스: 위·경도 좌표를 구면 좌표로 변환해 마커와 카메라 타깃 설정

지리 베이스는 생성형 알베도가 아니라 NASA SVS의 2048×1024 Blue Marble 래스터를 WebP로 최적화한 `earth-blue-marble-nasa.webp`다. 시작 화면과 Babylon.js 지구가 같은 실제 지리 기준을 공유하며, 셀·도시·이주·위험은 그 위에 게임 상태 오버레이로 표시한다. Imagegen 에셋은 지도로 오인될 수 없는 궤도 관측 배경에만 사용한다. 출처·해시·변환 기록은 [`ASSET_PROVENANCE.md`](./ASSET_PROVENANCE.md)에 고정한다.

시뮬레이션의 5,000개 셀이 5,000개의 복잡한 게임 오브젝트가 되지 않게 한다. 렌더 데이터는 색, 높이, 상태, 위치 버퍼로 압축하고 하나의 메시/재질군에서 그린다.

### 5.3 품질 프리셋

| 항목 | High/WebGPU | Compatible/WebGL2 |
|---|---|---|
| 해상도 배율 | 1.0–1.5 | 0.75–1.0 |
| 대기/후처리 | 전체 | 축소 |
| 구름 | 동적 | 단순 회전 텍스처/비활성 |
| 재난 입자 | 다수 | 대표 지점만 |
| 도시 불빛 | 전체 인스턴스 | 거리/규모 LOD |
| 이주 경로 | 최대 12개 | 최대 6–8개 |

목표 프레임은 1080p 기준 일반 노트북에서 45fps 이상, 최소 허용은 30fps다. 시뮬레이션 턴 처리 목표는 5,000셀 기준 150ms 이하이다.

## 6. Worker 시뮬레이션

### 6.1 왜 Worker인가

기후·자원·인구 이동은 턴마다 모든 셀을 여러 번 순회한다. 메인 스레드에서 실행하면 카메라, 버튼 피드백과 스크린 리더 응답이 멈출 수 있다. Dedicated Worker는 계산을 UI와 분리하고, 브라우저가 저사양일 때도 진행 상태를 유지한다.

### 6.2 프로토콜

요청:

- `INIT(save?)`: 신규 세계 생성 또는 저장 복구
- `STEP(policyIds, eventChoiceId)`: 5년 진행
- `RESET`: 초기 시드와 상태로 재구축

응답:

- `READY`: 최초/초기화 스냅샷
- `STATE`: 새 전역 상태, 세계 스냅샷, 이주 요약
- `ERROR`: 복구 가능한 오류 메시지

프로토콜에 버전을 부여하고, 저장 버전과 별도로 관리한다. 미래 버전에서 필드가 추가되어도 구버전 저장을 마이그레이션할 수 있게 한다.

### 6.3 틱 순서

한 `STEP` 안에서 순서를 고정해 인과를 읽을 수 있게 한다.

1. 정책과 사건 효과 합산
2. 전역 배출·기온·경제·신뢰·자연·회복력 갱신
3. 셀별 열 스트레스와 재난 샘플링
4. 셀별 물·식량·경제·주거비 갱신
5. 거주 가능성과 이주 압력 계산
6. 코호트별 이동량 계산
7. 출발지/도착지 인구를 동시에 반영
8. 도시 성장·안정·긴장·붕괴 분류
9. 상위 시각화 경로와 전역 요약 생성

이주 계산은 먼저 별도 `nextPopulation` 배열에 누적한 뒤 일괄 반영한다. 순회 앞쪽 셀이 뒤쪽 셀보다 유리해지는 업데이트 순서 편향을 줄이기 위해서다.

## 7. TypedArray 데이터 모델

객체 배열 대신 **Struct of Arrays**를 사용한다.

```ts
interface WorldSnapshot {
  cellCount: number
  latitude: Float32Array
  longitude: Float32Array
  land: Uint8Array
  biome: Uint8Array
  temperature: Float32Array
  population: Float32Array
  cohortYoung: Float32Array
  cohortWorking: Float32Array
  cohortSenior: Float32Array
  food: Float32Array
  water: Float32Array
  economy: Float32Array
  housingCost: Float32Array
  habitability: Float32Array
  migrationPressure: Float32Array
  cityState: Uint8Array
  disaster: Uint8Array
  countryIndex: Uint8Array
}
```

이 구조의 장점:

- 한 변수의 전체 셀을 연속 순회해 CPU 캐시 효율이 높다.
- 셀별 객체 생성이 없어 가비지 컬렉션 중단을 줄인다.
- `ArrayBuffer`를 Worker 메시지의 transferable로 넘길 수 있다.
- 동일한 배열 레이아웃을 WebGPU storage buffer 또는 WASM 메모리로 옮기기 쉽다.

`Float32Array`는 게임에 필요한 정밀도와 메모리의 균형이다. 범주와 상태는 `Uint8Array`, 큰 안정적 식별자가 필요해질 때는 `Uint16Array`/`Uint32Array`를 사용한다.

### 전송 소유권

transferable buffer를 보내면 송신 측 버퍼는 detach된다. Worker는 다음 턴을 위해 내부 원본을 유지하고 **전송용 스냅샷을 복제해 전달**하거나, 핑퐁 버퍼를 사용해야 한다. MVP는 단순성과 안전을 위해 스냅샷 복제를 허용하고, 20,000셀부터 이중 버퍼 및 변경 필드 전송을 검토한다.

## 8. 결정론과 난수

- `Math.random()`에 직접 의존하지 않고 `worldSeed + turn + cellId`에서 난수를 만든다.
- 정책/사건 입력과 저장된 seed가 같으면 같은 결과가 나와야 한다.
- 부동소수점 차이는 허용 오차 기반 테스트로 다룬다.
- GPU compute로 옮길 때 CPU와 비트 단위 동일함보다 분포·보존량·경계 조건의 동등성을 검증한다.

결정론은 버그 재현, 밸런싱, 시연 안정성, 미래의 서버 검증 점수에 필요하다.

## 9. 저장과 복구

Challenge MVP는 IndexedDB에 자동 저장한다.

```text
database: gaia-2126
store: saves
key: autosave
payload: version + savedAt + global + world + seed
```

- `READY`와 `STATE`를 받은 뒤 비동기로 저장한다.
- 저장 실패는 플레이를 막지 않는다. 사생활 보호 모드와 저장 용량 제한을 고려한다.
- 로드 실패 또는 알 수 없는 버전은 안전하게 새 게임으로 시작한다.
- 초기화는 저장 키와 Worker 메모리를 모두 다시 만든다.
- 저장 중 브라우저를 닫아도 이전 완료 스냅샷은 유효해야 한다.

추후 대형 저장은 TypedArray buffer를 Blob/ArrayBuffer 그대로 저장하고, 메타데이터와 분리한다.

## 10. 최종 대시보드와 리더보드 계약

### 10.1 순위 모델

정렬 키는 게임 규칙으로 고정하고 UI와 미래 서버가 공유한다.

```text
ORDER BY end_year DESC, score DESC
```

- `endYear`: 실제로 도달한 마지막 연도. 2126년 완주가 조기 붕괴보다 우선한다.
- `score`: 최종 기온, 자연, 신뢰, 회복력과 배출 경로의 스튜어드십 종합 점수.
- 같은 두 값의 안정적 표시 순서에만 `temperature ASC, id ASC`를 추가한다. 생존 연도와 점수라는 핵심 순위 규칙은 바꾸지 않는다.

현재 reference score는 버전이 붙은 순수 함수로 계산한다.

```text
round(clamp(
  1000
  - max(0, temperature - 1.5) * 260
  + nature * 1.8
  + trust * 1.4
  + resilience * 1.2
  + max(0, 45 - emissions) * 3,
  0, 1200
))
```

점수 공식을 수정하면 `simulationVersion`도 올린다. 서로 다른 규칙 버전의 run은 같은 시즌 순위표에 섞지 않는다.

최종 row에는 다음 값을 전달한다.

```ts
interface LeaderboardEntry {
  id: string
  callsign: string
  score: number
  endYear: number
  grade: string
  temperature: number
  nature: number
  trust: number
  resilience: number
  strategy: string[]
  submittedAt: string
  verified: boolean
}
```

`strategy` 태그는 플레이어가 입력하는 문장이 아니라 투자 레벨이 높은 정책 3개에서 결정론적으로 계산한다. 서버 검증 때 같은 태그를 다시 만들 수 있고, 부적절한 사용자 텍스트 문제도 없다.

### 10.2 Challenge 빌드: 로컬 폴백

`.env`에서 `VITE_LEADERBOARD_API_URL`을 비워 둔 현재 정적 웹 빌드는 공유 백엔드로 요청하지 않으며, 화면에 `LOCAL DEMO`로 표시한다.

- 현재 완료 run과 이 브라우저의 과거 완료 run을 `localStorage`의 `gaia-2126-leaderboard-v1`에 최대 20개 저장한다.
- 비교가 필요한 첫 플레이에는 소스 코드에 버전이 고정된 내장 샘플 기록을 표시한다.
- 전체 보드는 생존 연도 → 점수 → 최종 기온 표시 순서로 정렬하고 상위 50개만 렌더한다.
- 내장 샘플과 로컬 기록을 온라인 사용자 또는 실시간 Hive 사용자처럼 보이게 만들지 않는다. 화면 전체의 `LOCAL DEMO` 표시는 개별 entry의 `verified` 필드보다 우선한다.
- 네트워크 실패 상태가 아니라 **로컬 모드**임을 배지로 표시한다.
- 최종 온도, 자연, 신뢰, 회복력, 전략 태그와 정렬 규칙은 미래 네트워크 화면과 동일하다.

로컬 제출 entry는 항상 `verified: false`다. 저장 실패 시에도 현재 run 결과 대시보드를 먼저 표시해 결말 흐름을 막지 않는다. 장기적으로 기록이 커질 때만 기존 IndexedDB와 통합을 검토한다.

### 10.3 구현된 선택형 REST API 계약

`services/leaderboard-worker`에 Cloudflare Worker + D1 API, migration, golden fixture와 HTTP/검증 테스트가 구현되어 있다. **코드와 로컬 검증은 완료했지만 외부 Worker/D1은 아직 배포하지 않았다.** 배포 주소가 생겼을 때만 빌드 환경의 `VITE_LEADERBOARD_API_URL`을 설정하며, 기본 GitHub Pages는 계속 `LOCAL DEMO`다.

```http
GET  {VITE_LEADERBOARD_API_URL}/leaderboard
POST {VITE_LEADERBOARD_API_URL}/leaderboard
```

`GET /leaderboard?limit=50`은 생존 연도 → 점수 → 낮은 기온 순으로 서버가 저장한 `verified` entry만 반환한다. 클라이언트에서 4초 안에 성공하지 않거나 응답 스키마가 맞지 않으면 자동으로 `LOCAL DEMO` 보드를 사용한다.

현재 `POST` 요청 계약:

```json
{
  "entry": {
    "id": "dc7192d4-65cf-4b36-9ad9-9f576f6c55ec",
    "callsign": "BLUE DOT",
    "score": 947,
    "endYear": 2126,
    "grade": "A",
    "temperature": 2.08,
    "nature": 71,
    "trust": 66,
    "resilience": 82,
    "strategy": ["행성 전력망", "야생 회랑"],
    "submittedAt": "2026-08-10T00:00:00.000Z",
    "verified": false
  },
  "proof": {
    "simulationVersion": 1,
    "scenarioId": "earth-2026-standard",
    "seed": 0,
    "actions": [
      { "turn": 0, "year": 2026, "policyIds": ["solar-cities"], "eventChoiceId": "coalition" }
    ]
  }
}
```

5초 안에 성공한 `POST`는 Worker가 검증·정규화하고 D1에 저장한 `LeaderboardEntry`를 반환한다. 실패/timeout이면 클라이언트는 완주 기록을 잃지 않도록 로컬에 저장하고 `verified: false`로 유지한다.

현재 proof v1은 `simulationVersion + scenarioId(선택, 서버 기본값 사용 가능) + seed + turn별 actions`다. 별도의 `history`나 최종 `policyLevels`를 신뢰 자료로 받지 않는다. Worker가 2026년 초기 상태에서 1–20턴의 정책·사건 로그를 순서대로 다시 적용해 정책 레벨, 기금, 배출, 기온, 자연, 신뢰, 경제, 회복력과 청정에너지를 재구성한다. 따라서 **v1 순위 점수에 필요한 전역 게임 상태는 서버에서 완전히 재실행**된다. 5,000셀 공간 스냅샷은 현재 순위 점수의 입력이 아니므로 proof에 싣지 않는다.

Worker의 실제 검증 순서:

1. JSON, 32 KiB 본문, UUID v4, callsign, 수치 범위와 배열 길이를 경계에서 검사
2. `simulationVersion`, `scenarioId`, season에서 허용한 seed 확인
3. 매 턴의 연도·순서·정책 1–2개·중복·비용·최대 레벨과 사건 선택 ID 검증
4. `gaia-global-v1-2026-08-10` 규칙으로 액션 전체를 시작 상태부터 결정론적으로 재실행
5. 서버 계산 종료 연도·기온·자연·신뢰·회복력·점수·등급·전략 태그와 client entry를 모두 비교
6. 하나라도 다르면 `422 verified:false`로 거부하고 D1에 쓰지 않음
7. 통과하면 서버 ID·시각과 `verified:true`를 발급하고 D1 prepared statement로 저장

추가 통제:

- 정확한 CORS origin allowlist와 `nosniff`/CSP/`no-referrer` 응답 헤더
- Cloudflare Rate Limiting binding이 없으면 `503`으로 닫는 fail-closed 동작
- NFKC callsign 정규화, 제어·방향 문자 제거, 허용 문자와 18자 제한
- `(season_id, client_submission_id)` 고유 인덱스와 `Idempotency-Key` 재시도 계약
- proof JSON과 SHA-256 감사 인덱스; IP/User-Agent는 D1에 저장하지 않음

`verified`는 규칙과 결과의 무결성을 뜻하며 인간의 직접 플레이나 1인 1기록을 증명하지 않는다. 공개 경쟁 시즌 전에는 Hive/계정 인증, 서명된 단회 season nonce, 계정별 제출 정책과 봇 완화를 추가한다.

응답 예:

```json
{
  "id": "server-run-id",
  "callsign": "BLUE DOT",
  "score": 947,
  "endYear": 2126,
  "grade": "A",
  "temperature": 2.08,
  "nature": 71,
  "trust": 66,
  "resilience": 82,
  "strategy": ["행성 전력망", "야생 회랑"],
  "submittedAt": "2026-08-10T00:00:01.000Z",
  "verified": true
}
```

### 10.4 현재 D1 스키마와 이후 확장 기준

현재 구현의 진실 원천은 Cloudflare D1의 `leaderboard_runs`다. 핵심 컬럼은 다음과 같다.

```text
leaderboard_runs(
  id, client_submission_id, season_id, scenario_id,
  simulation_version, ruleset_id, seed,
  proof_json, proof_sha256, callsign,
  end_year, score, grade, temperature,
  nature, trust, resilience, strategy_json,
  verified, submitted_at, verified_at
)
```

핵심 인덱스:

```sql
(season_id, verified DESC, end_year DESC, score DESC,
 temperature ASC, submitted_at ASC)
```

Worker의 TypeScript 규칙과 브라우저 규칙이 어긋나지 않도록 고정 seed/선택 로그/기대 결과의 golden fixture를 실행한다. 현재 Worker 테스트는 정상 완주, 결과 변조, 정책 비용·최대 레벨, 사건·턴 순서, CORS, rate limit, 멱등 충돌과 저장/정렬 계약을 다룬다.

처음부터 Go/PostgreSQL/Redis로 교체하지 않는다. D1의 쓰기량·목록 조회 p95·보존 용량·시즌 집계가 실제 목표를 지속적으로 넘을 때만 Go/PostgreSQL 이관을 검토한다. Redis 역시 다중 인스턴스 캐시나 집계 병목이 측정된 뒤에만 추가하며, 어느 저장소를 쓰더라도 verified run의 영속 원본과 재실행 규칙은 하나여야 한다.

## 11. 성능 예산

| 예산 | MVP 목표 |
|---|---|
| 초기 JS 압축 전송 | 가능한 2MB 안팎, 3D 모듈 지연 로드 검토 |
| 첫 상호작용 가능 | 일반 광대역/노트북 3초 이내 목표 |
| 메인 스레드 long task | 50ms 초과 최소화 |
| 5,000셀 STEP | 150ms 이하 목표, 500ms 상한 |
| 3D | 보통 노트북 45fps 목표, 30fps 하한 |
| 메모리 | 250MB 미만 목표 |

측정 항목은 개발자 콘솔이 아니라 디버그 오버레이에서 engine, fps, cell count, step ms, buffer bytes로 노출할 수 있게 설계한다. 정식 플레이에서는 숨긴다.

## 12. 오류와 호환성

- WebGPU 초기화 실패 → WebGL2 자동 폴백
- 3D 장면 생성 실패 → 오류 설명과 재시도, 가능하면 단순 지구 모드
- Worker 생성 실패 → 플레이 불가 상태를 명확히 표시하고 새로고침 안내
- IndexedDB 실패 → 세션 플레이 계속, 저장 불가 배지
- 탭 비활성 → 렌더 루프 절전, 턴 계산은 완료
- `prefers-reduced-motion` → 자동 회전, 카메라 스윕, 입자 속도 축소
- 작은 화면 → 정보 패널 접기; Challenge 심사 권장 환경은 데스크톱 Chrome/Edge 최신판

지원 기준은 “WebGPU가 있는 브라우저”가 아니라 “WebGL2와 Web Worker를 지원하는 현대 브라우저”다.

## 13. 테스트 전략

### 단위 테스트

- 정책 비용과 최대 단계
- 지표 clamp와 게임 종료 경계
- 5년씩 20턴 후 2126 도달
- 인구 이동 전후 총량 보존(명시된 재난 손실 제외)
- 코호트 합과 총인구 일치
- 육지 셀만 도시/이주 대상
- 같은 seed와 입력의 결정론

### 시나리오 테스트

- 강한 조기 감축 경로
- 적응 편중 경로
- 자연/정의 편중 경로
- 고배출/무대응 경로
- 예산 0, 신뢰 0, 자연 0 직전
- 저장 → 새 세션 → 복구 후 같은 다음 턴 결과
- 생존 연도 우선, 동일 연도에서 종합 점수 우선 정렬
- 정책 로그에서 전략 태그를 같은 방식으로 재생성
- 클라이언트 claimed score·등급·전략 태그 변조 시 Worker 재실행 검증 거부

### 브라우저 E2E 체크리스트

1. 캐시 없는 배포 URL 접속
2. 첫 턴 완료
3. 국가 검색과 카메라 이동
4. 여러 턴 후 이주/도시 변화 확인
5. 새로고침 후 자동 저장 복구
6. 초기화
7. WebGPU와 강제 WebGL2 각각 실행
8. 콘솔 오류와 네트워크 404 없음

## 14. 보안과 개인정보

기본 GitHub Pages는 계정, 분석 SDK, 위치, 광고를 요구하지 않으며 저장과 `LOCAL DEMO` 순위가 브라우저 안에만 남는다. 외부 요청 없이 한 판을 완료할 수 있다. 선택형 Worker를 향후 배포하면 공개 callsign과 선택 로그가 D1에 저장되므로 배포 전에 보존 기간·삭제 절차·개인정보 고지를 확정한다. Worker는 클라이언트가 보낸 점수·태그·최종 지표를 그대로 공개하지 않고 전체 v1 로그 재실행이 일치한 기록만 저장한다.

## 15. 배포

Vite의 base path는 GitHub Pages 프로젝트 경로인 `/openai_game_2026/`로 설정한다.

```text
push to main
  → GitHub Actions
  → npm ci
  → npm test
  → npm run build
  → dist artifact
  → GitHub Pages deploy
  → smoke test playable URL
```

배포 URL: `https://sdj3261.github.io/openai_game_2026/`

이 URL은 정적 게임만 배포하며 `VITE_LEADERBOARD_API_URL`을 비워 둔 `LOCAL DEMO`다. Cloudflare Worker와 D1은 별도 서비스로 구현되어 있으나 외부 배포하지 않았다. 향후 API를 배포해도 URL이 없거나 실패하면 클라이언트가 즉시 localStorage 보드로 폴백한다. 정적 자산 URL은 Vite base path를 사용하고, Worker API origin은 빌드 환경 변수 하나로만 주입한다.

## 16. 단계별 확장 로드맵

### Phase 1 — 5,000셀 Challenge MVP

- TypeScript Worker 단일 스레드
- 전역 기후 + 지역 기온/물/식량/경제
- 3개 코호트와 이주
- Babylon.js 인스턴싱
- 턴 단위 전체 스냅샷
- IndexedDB 단일 자동 저장

**게이트:** 심사 링크에서 20턴 완주, 30fps 이상, 계산 500ms 미만, 치명적 오류 0.

### Phase 2 — 20,000셀 Release Candidate

- 셀 이웃 그래프 사전 계산
- 지역 기후, 토양 수분, 식량, 이주의 공간 해상도 향상
- 이중 버퍼 또는 delta 전송
- 지구 레이어 LOD와 국가/도시 인덱스 확장
- Worker 프로파일링 후 hot loop 최적화

**게이트:** 중급 노트북에서 STEP 1초 미만, 메인 스레드 long task 없음, 저장/로드 2초 미만.

### Phase 3 — 100,000셀 WebGPU Compute

GPU로 옮기기 좋은 국소·규칙적 계산만 선택한다.

- 기온 확산
- 해양 표층 온도
- 습도/오염 전파
- 토양 수분과 식생 변화
- 이웃 합성 및 위험장 생성

정책, 사건, 코호트 의사결정, 결과 서사는 CPU에 남긴다. Compute shader가 가능한 브라우저에서는 GPU 경로, 그 외에는 저해상도 CPU 경로를 제공한다. WebGPU가 게임 진입의 필수 조건이 되어서는 안 된다.

**게이트:** CPU 기준 구현과 통계적 동등성, GPU 자원 소실 복구, 60Hz 렌더와 compute 간 프레임 예산 확보.

### Phase 4 — 필요할 때만 Rust/WASM

프로파일링에서 병목으로 확인된 CPU 커널만 Rust로 이식한다.

- 경로 탐색과 이주 매칭
- 대형 희소 이웃 그래프
- 결정론적 시나리오 배치 실행
- 저장 압축/해제

WASM 도입 자체를 성과로 삼지 않는다. JS↔WASM 경계를 턴당 1–2회로 제한하고, TypedArray 메모리 레이아웃을 공유한다. TypeScript 참조 구현은 테스트 오라클과 호환 폴백으로 유지한다.

### Phase 5 — 서비스 확장

- 기본 공개 페이지: 네트워크 요청 없는 로컬 결과/기준 시나리오 순위표
- 구현 완료·미배포: Cloudflare Worker가 v1 선택 로그 전체를 재실행하고 D1에 verified run 저장
- 배포 전: D1 생성/migration, 실제 Worker URL 연결, 보존·삭제 정책과 운영 모니터링
- Hive: 인증 subject, 단회 season challenge, 커뮤니티 이벤트와 결과 공유 어댑터
- 장기 규모 옵션: 측정된 D1 한계를 넘을 때만 Go/PostgreSQL 이관과 Redis 캐시 검토

백엔드가 없어도 싱글 플레이는 계속 가능하게 하고, 서버 기능은 점진적 향상으로 제공한다.

## 17. 아키텍처 의사결정 기록

| 결정 | 선택 | 이유 |
|---|---|---|
| 3D 엔진 | Babylon.js | 렌더링 라이브러리를 넘어 게임용 장면·인스턴싱·파티클·WebGPU 경로가 통합됨 |
| UI 결합 | React UI + Babylon 캔버스 분리 | 복잡한 대시보드 접근성과 3D 프레임 루프를 각각 적합한 도구로 처리 |
| 계산 위치 | Dedicated Worker | 메인 스레드 멈춤 방지 |
| 개체 모델 | 셀 + 코호트 | 대규모 인구의 행동을 설명 가능하고 저렴하게 계산 |
| 데이터 구조 | TypedArray SoA | 메모리, 순회, Worker/GPU/WASM 이식성 |
| 심사 클라이언트 서버 의존성 | 없음 | API 미설정·장애에서도 완주와 로컬 결과 보장 |
| 선택형 공유 순위 구현 | Cloudflare Worker + D1 | 정적 페이지와 독립 배포, 전체 v1 로그 재실행, 작은 운영 표면 |
| 저장 | IndexedDB | 대형 TypedArray와 오프라인 정적 웹에 적합 |
| GPU compute | MVP 이후 | 재미와 코어 루프 검증 전에 기술 난이도가 폭발하는 것을 방지 |
| 현재 순위표 | 클라이언트 로컬 | 서버 없는 심사 빌드에서도 결과 비교를 제공하고 온라인인 척하지 않음 |
| 네트워크 점수 | 서버 재실행 검증 | 클라이언트 변조와 규칙 버전 혼합 방지 |
| 캐시/대형 DB | 후도입 | D1의 측정된 한계가 확인되기 전에 운영 복잡도를 늘리지 않음 |

## 18. 금지할 안티패턴

- 3D 오브젝트 하나당 React 상태 하나를 생성하지 않는다.
- Worker의 대형 배열을 매 프레임 Zustand에 다시 넣지 않는다.
- 실제 세계 예측값인 것처럼 하드코딩 국가 수치를 표시하지 않는다.
- WebGPU 기능을 지원 조건으로 만들어 WebGL2 사용자를 차단하지 않는다.
- 병목 측정 전에 Rust/WASM 또는 compute shader로 재작성하지 않는다.
- 렌더 프레임 속도에 따라 시뮬레이션 결과가 달라지게 하지 않는다.
- 로컬 기준 기록을 실제 온라인 사용자나 라이브 순위처럼 표시하지 않는다.
- 클라이언트가 제출한 점수와 전략 태그를 서버 검증 없이 공유 순위표에 싣지 않는다.
