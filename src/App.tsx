import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { GameIcon } from './components/GameIcon'
import { COUNTRIES } from './data/countries'
import { POLICIES } from './data/policies'
import { createLeaderboardEntry, leaderboardMode, loadLeaderboard, submitScore, type LeaderboardEntry } from './game/leaderboard'
import { getEnding, getEventForTurn, getPolicyCost, projectCountry } from './game/simulation'
import { useGameStore } from './game/store'

const WorldScene = lazy(() => import('./components/WorldScene').then((module) => ({ default: module.WorldScene })))
const CountryDiorama = lazy(() => import('./components/CountryDiorama').then((module) => ({ default: module.CountryDiorama })))

const effectLabels: Record<string, string> = {
  emissions: '배출', nature: '자연', trust: '신뢰', economy: '경제',
  resilience: '회복력', funds: '기금', cleanEnergy: '청정전력',
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

function flagEmoji(code: string) {
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
}

function populationLabel(millions: number) {
  return millions >= 1000 ? `${(millions / 1000).toFixed(2)}B` : `${millions.toFixed(millions >= 100 ? 0 : 1)}M`
}

function Metric({ icon, label, value, detail, danger }: { icon: Parameters<typeof GameIcon>[0]['name']; label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className={`metric ${danger ? 'metric--danger' : ''}`}>
      <GameIcon name={icon} size={18} />
      <div><span>{label}</span><strong>{value}</strong></div>
      <small>{detail}</small>
    </div>
  )
}

function App() {
  const game = useGameStore()
  const initialize = game.initialize
  const [view, setView] = useState<'planet' | 'ranking'>('planet')
  const [countryQuery, setCountryQuery] = useState('대한민국')
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([])
  const [callsign, setCallsign] = useState('EARTHKEEPER')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    if (view === 'ranking') void loadLeaderboard().then(setRankings)
  }, [view])

  const selectedCountryIndex = Math.max(0, COUNTRIES.findIndex((country) => country.id === game.selectedCountryId))
  const country = COUNTRIES[selectedCountryIndex]
  const projection = projectCountry(country, game.global)
  const worldEvent = getEventForTurn(game.global.turn)
  const ending = getEnding(game.global)
  const selectedCost = getPolicyCost(game.selectedPolicies)
  const progress = Math.min(100, Math.max(0, (game.global.year - 2026) / 100 * 100))

  const countryStats = useMemo(() => {
    const empty = { population: 0, young: 0, working: 0, senior: 0, pressure: 0, stressed: 0, collapsed: 0, growing: 0 }
    if (!game.world) return empty
    let weightedPressure = 0
    for (let index = 0; index < game.world.cellCount; index += 1) {
      if (game.world.countryIndex[index] !== selectedCountryIndex || !game.world.land[index]) continue
      const population = game.world.population[index]
      empty.population += population
      empty.young += game.world.cohortYoung[index]
      empty.working += game.world.cohortWorking[index]
      empty.senior += game.world.cohortSenior[index]
      weightedPressure += game.world.migrationPressure[index] * population
      if (game.world.cityState[index] === 3) empty.stressed += 1
      if (game.world.cityState[index] === 4) empty.collapsed += 1
      if (game.world.cityState[index] === 1) empty.growing += 1
    }
    empty.pressure = empty.population ? weightedPressure / empty.population : 0
    const rawPopulation = empty.population
    const elapsed = (game.global.year - 2026) / 100
    const citySignal = (empty.growing - empty.collapsed) / Math.max(10, empty.growing + empty.stressed + empty.collapsed)
    const populationFactor = Math.min(1.18, Math.max(0.62, 1 - empty.pressure * elapsed * 0.42 + citySignal * elapsed * 0.1))
    empty.population = country.population2026 * populationFactor
    empty.young = empty.population * (rawPopulation ? empty.young / rawPopulation : 0.22)
    empty.working = empty.population * (rawPopulation ? empty.working / rawPopulation : 0.58)
    empty.senior = Math.max(0, empty.population - empty.young - empty.working)
    return empty
  }, [country.population2026, game.global.year, game.world, selectedCountryIndex])

  function selectCountryFromQuery(value: string) {
    setCountryQuery(value)
    const normalized = value.trim().toLowerCase()
    const match = COUNTRIES.find((item) => item.nameKo.toLowerCase() === normalized
      || item.nameEn.toLowerCase() === normalized || item.id.toLowerCase() === normalized)
    if (match) game.selectCountry(match.id)
  }

  function playConfirmation() {
    if (!game.audioEnabled) return
    const AudioContextClass = window.AudioContext
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(420, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(680, context.currentTime + 0.12)
    gain.gain.setValueAtTime(0.035, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.17)
    oscillator.onended = () => void context.close()
  }

  function advanceTurn() {
    playConfirmation()
    game.advance()
  }

  async function submitRun(event: FormEvent) {
    event.preventDefault()
    if (!game.global.gameOver || submitting) return
    setSubmitting(true)
    await submitScore(createLeaderboardEntry(game.global, callsign), game.global)
    setRankings(await loadLeaderboard())
    setSubmitting(false)
  }

  if (!game.started) {
    return (
      <main className="intro">
        <div className="intro__shade" />
        <div className="intro__content">
          <div className="brand-mark"><GameIcon name="globe" size={24} /><span>OPEN PLANETARY INITIATIVE</span></div>
          <p className="intro__eyebrow">A CIVILIZATION SURVIVAL TYCOON</p>
          <h1>GAIA<span>//</span>2126</h1>
          <h2>살아있는 지구</h2>
          <p className="intro__lead">정책을 선택하면 기후가 바뀌고, 사람들이 이동하며, 도시가 살아남거나 무너집니다. 100년 뒤에도 살 수 있는 지구를 남기세요.</p>
          <div className="intro__baseline">
            <strong>+1.48°C</strong>
            <span>2023–2025 관측 평균에서 시작<br />이미 뜨거워진 세계입니다.</span>
          </div>
          <button className="primary-button primary-button--hero" onClick={game.start} disabled={!game.ready}>
            {game.ready ? game.global.turn ? '저장된 지구 계속하기' : '행성 운영 시작' : '5,000개 셀 초기화 중'}
            <GameIcon name="arrow" />
          </button>
          {game.error && <p className="inline-error">{game.error}</p>}
          <p className="intro__note">브라우저에서 실행되는 게임 모델 · 실제 국가 예측 도구가 아닙니다</p>
        </div>
        <div className="intro__signal"><i /> LIVE SIMULATION <b>5K</b></div>
      </main>
    )
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setView('planet')} aria-label="행성 화면으로 이동">
          <GameIcon name="globe" /><strong>GAIA<span>//</span>2126</strong><small>살아있는 지구</small>
        </button>
        <div className="topbar__metrics">
          <Metric icon="thermometer" label="평균기온" value={`+${game.global.temperature.toFixed(2)}°C`} detail="산업화 이전 대비" danger={game.global.temperature >= 2} />
          <Metric icon="cloud" label="연간 배출" value={`${game.global.emissions.toFixed(1)} Gt`} detail="CO₂ / year" danger={game.global.emissions > 35} />
          <Metric icon="leaf" label="생태 건전성" value={`${Math.round(game.global.nature)}`} detail="BIOSPHERE INDEX" danger={game.global.nature < 40} />
          <Metric icon="shield" label="시민 신뢰" value={`${Math.round(game.global.trust)}%`} detail="PUBLIC MANDATE" danger={game.global.trust < 35} />
        </div>
        <div className="topbar__actions">
          <button className={view === 'ranking' ? 'is-active' : ''} onClick={() => setView(view === 'ranking' ? 'planet' : 'ranking')}>
            <GameIcon name="spark" size={17} /> 랭킹
          </button>
          <button onClick={game.toggleAudio} aria-label={game.audioEnabled ? '효과음 끄기' : '효과음 켜기'}><GameIcon name={game.audioEnabled ? 'sound' : 'mute'} size={18} /></button>
          <button onClick={() => { if (window.confirm('현재 행성을 초기화할까요? 저장된 진행도 함께 지워집니다.')) void game.reset() }} aria-label="새 게임"><GameIcon name="reset" size={18} /></button>
        </div>
      </header>

      {view === 'ranking' ? (
        <section className="ranking-view">
          <div className="ranking-hero">
            <p>PLANETARY ARCHIVE</p>
            <h2>누가 더 오래,<br /><em>어떻게</em> 살아남았는가</h2>
            <span>생존 연도를 먼저, 같은 연도에서는 행성 관리 점수를 비교합니다.</span>
            <div className="network-badge"><i /> {leaderboardMode()}</div>
          </div>
          <div className="ranking-board panel">
            <div className="panel__heading"><div><span>GLOBAL STEWARDS</span><h3>행성 운영자 랭킹</h3></div><small>{rankings.length} RUNS</small></div>
            <div className="ranking-table" role="table" aria-label="행성 운영자 랭킹">
              <div className="ranking-row ranking-row--head" role="row"><span>#</span><span>운영자 / 전략</span><span>생존</span><span>기온</span><span>점수</span></div>
              {rankings.map((entry, index) => (
                <div className="ranking-row" role="row" key={entry.id}>
                  <strong>{String(index + 1).padStart(2, '0')}</strong>
                  <div><b>{entry.callsign}</b><small>{entry.strategy.join(' · ') || '기록 없음'} {entry.verified && '✓'}</small></div>
                  <span>{entry.endYear}</span><span>+{entry.temperature.toFixed(2)}°</span><em>{entry.score}</em>
                </div>
              ))}
            </div>
            {game.global.gameOver && (
              <form className="score-submit" onSubmit={submitRun}>
                <div><small>YOUR FINAL RUN</small><strong>{ending.grade} · {ending.score}점 · {game.global.year}년</strong></div>
                <input value={callsign} onChange={(event) => setCallsign(event.target.value)} maxLength={18} aria-label="랭킹 이름" />
                <button className="primary-button" disabled={submitting}>{submitting ? '전송 중' : '기록 제출'}</button>
              </form>
            )}
          </div>
          <aside className="ranking-stats panel">
            <div className="panel__heading"><div><span>CURRENT EARTH</span><h3>현재 운영 통계</h3></div></div>
            <div className="big-grade">{ending.grade}</div>
            <h4>{ending.title}</h4><p>{ending.description}</p>
            <dl><div><dt>생존 연도</dt><dd>{game.global.year}</dd></div><div><dt>회복력</dt><dd>{Math.round(game.global.resilience)}</dd></div><div><dt>청정전력</dt><dd>{Math.round(game.global.cleanEnergy)}%</dd></div><div><dt>생태계</dt><dd>{Math.round(game.global.nature)}</dd></div></dl>
            <button className="secondary-button" onClick={() => setView('planet')}>행성으로 돌아가기</button>
          </aside>
        </section>
      ) : (
        <section className="dashboard">
          <aside className="policy-panel panel">
            <div className="panel__heading"><div><span>POLICY DECK</span><h3>이번 5년의 개입</h3></div><small>{game.selectedPolicies.length}/2 선택 · ◈ {selectedCost}</small></div>
            <div className="policy-list">
              {POLICIES.map((policy) => {
                const selected = game.selectedPolicies.includes(policy.id)
                const level = game.global.policyLevels[policy.id] ?? 0
                const maxed = level >= policy.maxLevel
                return (
                  <button
                    key={policy.id}
                    className={`policy-card ${selected ? 'is-selected' : ''}`}
                    style={{ '--policy-accent': policy.accent } as CSSProperties}
                    onClick={() => game.togglePolicy(policy.id)}
                    disabled={maxed || (!selected && game.selectedPolicies.length >= 2)}
                  >
                    <span className="policy-card__icon"><GameIcon name={policy.icon} /></span>
                    <span className="policy-card__copy"><strong>{policy.shortName}</strong><small>{policy.description}</small><i>{Object.entries(policy.effects).slice(0, 3).map(([key, value]) => `${effectLabels[key]} ${signed(value)}`).join(' · ')}</i></span>
                    <span className="policy-card__meta"><b>◈ {policy.cost}</b><small>{Array.from({ length: policy.maxLevel }, (_, index) => index < level ? '●' : '○').join('')}</small></span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="planet-stage">
            {game.world ? <Suspense fallback={<div className="planet-loading">Babylon 엔진을 불러오는 중…</div>}><WorldScene temperature={game.global.temperature} cleanEnergy={game.global.cleanEnergy} country={country} world={game.world} migration={game.migration} paused={game.busy} onEngineChange={game.setEngineLabel} /></Suspense> : <div className="planet-loading">행성 셀을 배치하는 중…</div>}
            <div className="engine-chip"><i /> {game.engineLabel}</div>
            <div className="year-display"><small>SIMULATION YEAR</small><strong>{game.global.year}</strong><span>TURN {String(Math.min(20, game.global.turn + 1)).padStart(2, '0')} / 20</span></div>
            <div className="migration-card">
              <span><i className="migration-line" /> POPULATION FLOW</span>
              <strong>{populationLabel(game.migration.displacedMillions)}</strong>
              <small>이번 턴 이동 · 성장 도시 {game.migration.growingCities} · 붕괴 {game.migration.collapsedCities}</small>
            </div>
            <div className="globe-legend"><span><i className="legend-city" /> 안정 도시</span><span><i className="legend-stress" /> 위험 도시</span><span><i className="legend-flow" /> 이주 흐름</span></div>
            <div className="timeline"><span>2026</span><div><i style={{ width: `${progress}%` }} /><b style={{ left: `${progress}%` }} /></div><span>2126</span></div>
          </section>

          <aside className="intel-panel panel">
            <div className="panel__heading"><div><span>COUNTRY LENS</span><h3>국가 미래 관측소</h3></div><GameIcon name="search" /></div>
            <label className="country-search"><GameIcon name="search" size={17} /><input type="search" list="countries" value={countryQuery} onChange={(event) => selectCountryFromQuery(event.target.value)} placeholder="국가 검색" /><datalist id="countries">{COUNTRIES.map((item) => <option key={item.id} value={item.nameKo}>{item.nameEn}</option>)}</datalist></label>
            <div className="country-title"><span>{flagEmoji(country.flag)}</span><div><strong>{country.nameKo}</strong><small>{country.nameEn} · {country.id}</small></div><em className={projection.risk > 65 ? 'risk-high' : ''}>RISK {projection.risk}</em></div>
            <div className="diorama-wrap"><Suspense fallback={<div className="planet-loading">미래 도시 구성 중…</div>}><CountryDiorama biome={country.biome} projection={projection} year={game.global.year} /></Suspense><span>MODEL VIEW · {game.global.year}</span></div>
            <div className="status-callout"><small>{projection.status}</small><p>{projection.narrative}</p></div>
            <div className="country-indicators"><div><span>극한 폭염일</span><strong>{projection.heatDays}<small>일/년</small></strong></div><div><span>해수면</span><strong>+{projection.seaLevelCm}<small>cm</small></strong></div><div><span>물 안보</span><strong>{projection.waterSecurity}<small>/100</small></strong></div></div>
            <div className="cohort-panel">
              <div className="cohort-heading"><span>POPULATION COHORTS · 2026 SCENARIO</span><strong>{populationLabel(countryStats.population)}</strong></div>
              {[['18–30', countryStats.young, '#70f6d2'], ['30–50', countryStats.working, '#65bfff'], ['50+', countryStats.senior, '#d7b7ff']].map(([label, value, color]) => (
                <div className="cohort-row" key={String(label)}><span>{label}</span><div><i style={{ width: `${countryStats.population ? Number(value) / countryStats.population * 100 : 0}%`, background: String(color) }} /></div><strong>{populationLabel(Number(value))}</strong></div>
              ))}
              <div className="pressure-row"><span>이주 압력</span><div><i style={{ width: `${countryStats.pressure * 100}%` }} /></div><strong>{countryStats.pressure.toFixed(2)}</strong></div>
            </div>
            <p className="model-note"><GameIcon name="info" size={15} /> 교육용 게임 모델입니다. 실제 국가 전망이 아닙니다.</p>
          </aside>

          <section className="turn-console panel">
            <div className="event-copy"><span>{worldEvent.eyebrow}</span><h3>{worldEvent.title}</h3><p>{worldEvent.description}</p></div>
            <div className="event-choices">
              {worldEvent.choices.map((choice) => <button className={game.eventChoiceId === choice.id ? 'is-selected' : ''} onClick={() => game.chooseEvent(choice.id)} key={choice.id}><GameIcon name={game.eventChoiceId === choice.id ? 'check' : 'arrow'} size={17} /><span><strong>{choice.label}</strong><small>{choice.consequence}</small></span></button>)}
            </div>
            <button className="advance-button" onClick={advanceTurn} disabled={game.busy || game.global.gameOver || !game.eventChoiceId || game.selectedPolicies.length === 0}>
              <span>{game.busy ? '세계 계산 중' : game.global.gameOver ? '시뮬레이션 종료' : '5년 진행'}</span><small>{game.eventChoiceId && game.selectedPolicies.length ? `${game.global.year + 5}년으로` : '정책과 대응을 선택하세요'}</small><GameIcon name="arrow" />
            </button>
          </section>
        </section>
      )}

      {game.global.gameOver && view === 'planet' && (
        <div className="ending-banner"><div className="ending-grade">{ending.grade}</div><div><small>FINAL PLANET REPORT</small><h2>{ending.title}</h2><p>{ending.description}</p></div><button className="primary-button" onClick={() => setView('ranking')}>랭킹과 통계 보기 <GameIcon name="arrow" /></button></div>
      )}
      {game.busy && <div className="calculating" role="status"><i /><span>5,000개 셀에서 다음 5년을 계산하고 있습니다</span></div>}
    </main>
  )
}

export default App
