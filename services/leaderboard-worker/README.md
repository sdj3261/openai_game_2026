# GAIA 2126 Leaderboard Worker

정적 GitHub Pages 게임을 위한 독립형 Cloudflare Worker + D1 리더보드입니다. 현재 저장소에는 **배포 설정과 구현만** 포함되며 외부 서비스에는 배포하지 않았습니다.

## 무엇을 검증하는가

`POST /leaderboard`는 클라이언트가 보낸 점수나 등급을 신뢰하지 않습니다.

1. 시뮬레이션 버전, 시즌 seed, 시나리오와 1~20개의 턴 로그를 검증합니다.
2. 각 턴의 연도, 정책 1~2개, 중복, 비용, 최대 레벨과 해당 턴 사건 선택지를 검증합니다.
3. `gaia-global-v1-2026-08-10` 규칙으로 2026년부터 전체 로그를 재실행합니다.
4. 서버가 계산한 종료 연도, 기온, 자연, 신뢰, 회복력, 점수, 등급과 전략 태그가 클라이언트 결과와 모두 같을 때만 저장합니다.
5. 서버가 새 ID와 제출 시각을 발급하고 `verified: true`를 반환합니다.

완주하지 않았거나 재실행 결과가 다른 요청은 저장하지 않고 `422`와 `verified: false`를 반환합니다. 지원하지 않는 규칙 버전이나 닫힌 seed도 같은 원칙으로 거절합니다. D1의 `verified` 컬럼은 향후 검토 대기 기록을 담을 수 있지만, 현재 공개 목록에 저장되는 새 기록은 완전 재실행을 통과한 것뿐입니다.

`verified`는 **서버 규칙과 결과가 일치한다**는 뜻입니다. 브라우저에 공개된 규칙으로 자동화된 플레이를 만들 수 있으므로, 사람의 직접 플레이나 한 사람당 한 기록까지 증명하지는 않습니다. 상금·계정 기반 시즌을 열기 전에는 로그인, 서버가 서명한 단회 season nonce/seed, 계정별 제출 제한을 추가해야 합니다.

## API 계약

클라이언트의 기존 계약을 그대로 사용합니다.

```http
GET  /leaderboard
POST /leaderboard
```

`GET /leaderboard?limit=50`은 생존 연도 → 점수 → 낮은 기온 순으로 최대 50개의 `LeaderboardEntry[]`를 반환합니다. `POST` 본문은 게임의 현재 형태입니다.

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
    "seed": 0,
    "actions": [
      {
        "turn": 0,
        "year": 2026,
        "policyIds": ["solar-cities"],
        "eventChoiceId": "coalition"
      }
    ]
  }
}
```

`proof.scenarioId`는 선택 사항이며 생략하면 배포 환경의 `SCENARIO_ID`를 사용합니다. `Idempotency-Key`를 보낼 경우 `entry.id`와 같아야 합니다. 같은 시즌과 제출 ID로 동일한 요청을 재시도하면 기존 결과를 반환하고, 다른 proof나 callsign으로 재사용하면 `409`입니다.

오류 응답은 항상 다음 형태이며 오류 기록을 랭킹에 넣지 않습니다.

```json
{
  "error": "proof_mismatch",
  "message": "The submitted result does not match the deterministic server replay.",
  "verified": false
}
```

## 로컬 검증

Node.js 22 이상을 권장합니다.

```powershell
cd services/leaderboard-worker
npm install
Copy-Item wrangler.example.toml wrangler.toml
npm run db:migrate:local
npm run check
npm run dev
```

별도 설정 없이 허용되는 브라우저 Origin은 다음과 같습니다.

- `https://sdj3261.github.io`
- `http://localhost:5173`, `http://localhost:4173`
- `http://127.0.0.1:5173`, `http://127.0.0.1:4173`

추가 프리뷰 Origin은 `EXTRA_ALLOWED_ORIGINS`에 쉼표로 구분해 넣습니다. Origin 문자열은 정확히 일치해야 하며 경로나 와일드카드는 허용하지 않습니다.

## Cloudflare 배포 준비

외부 배포는 이 절차를 실행할 권한이 있는 운영자가 수행합니다.

```powershell
cd services/leaderboard-worker
Copy-Item wrangler.example.toml wrangler.toml
npx wrangler login
npx wrangler d1 create gaia-leaderboard
```

출력된 D1 UUID를 `wrangler.toml`의 `database_id`에 넣고, `namespace_id`는 Cloudflare 계정 안에서 고유한 양의 정수로 바꿉니다. 이후:

```powershell
npm run check
npm run build
npm run db:migrate:remote
npx wrangler deploy --config wrangler.toml
```

배포 URL이 확정된 뒤에만 GitHub Pages 빌드 환경에 설정합니다.

```dotenv
VITE_LEADERBOARD_API_URL=https://gaia-2126-leaderboard.<account>.workers.dev
```

Worker 변수 예시는 [.dev.vars.example](./.dev.vars.example)에 있습니다. `wrangler.toml`과 `.dev.vars`는 이 디렉터리의 `.gitignore`에 포함되어 실제 DB ID나 로컬 값을 커밋하지 않습니다.

## 운영·규칙 변경

- 쓰기와 읽기는 Cloudflare Rate Limiting binding으로 네트워크/선택형 플레이어 ID 단위 분리 제한합니다. 바인딩이 빠지면 요청을 무제한 허용하지 않고 `503`으로 닫습니다.
- 요청 본문은 스트리밍 중에도 32 KiB에서 중단합니다. SQL은 모두 D1 prepared statement와 bind parameter를 사용합니다.
- callsign은 NFKC 정규화, 제어·방향 문자 제거, 허용 문자 제한, 18자 제한을 거칩니다. IP 주소나 User-Agent는 D1에 저장하지 않습니다.
- 랭킹 인덱스는 `(season_id, verified, end_year, score, temperature, submitted_at)`이며 proof SHA-256 감사 인덱스를 별도로 둡니다.
- 게임 규칙을 바꾸면 `SIMULATION_VERSION`을 올리고, Worker의 규칙과 [golden fixture](./test/domain.test.ts)를 같은 변경에서 갱신해야 합니다. 이전 버전 지원을 중단하면 기존 시즌을 닫고 새 시즌을 생성합니다.
- 배포 전 `npm run check`, `npm run build`, 로컬 D1 migration을 모두 통과시키고, 배포 후에는 422/429/5xx 비율과 D1 쓰기 오류를 Workers Logs에서 확인합니다.

현재 익명 API의 남은 위협과 공개 시즌 전 조치는 [SECURITY.md](./SECURITY.md)에 정리했습니다.
