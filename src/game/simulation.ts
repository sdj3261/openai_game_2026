import { COUNTRIES } from '../data/countries'
import { EVENTS, POLICIES } from '../data/policies'
import type {
  CountryProfile,
  CountryProjection,
  Effects,
  MigrationSummary,
  SimulationState,
  WorldSnapshot,
} from '../types'
import { CitySystem } from './systems/CitySystem'
import { ClimateSystem } from './systems/ClimateSystem'
import { MIGRATION_ROUTE_STRIDE, MigrationSystem } from './systems/MigrationSystem'
import { ResourceSystem } from './systems/ResourceSystem'
import { angularDistance, clamp, degrees, seeded } from './systems/worldMath'

export const WORLD_CELL_COUNT = 5000
export const BASELINE_WARMING_C = 1.48
export const SIMULATION_VERSION = 1
export { MIGRATION_ROUTE_STRIDE }

export const INITIAL_STATE: SimulationState = {
  year: 2026,
  turn: 0,
  simulationVersion: SIMULATION_VERSION,
  seed: 0,
  actionLog: [],
  temperature: BASELINE_WARMING_C,
  emissions: 42.2,
  funds: 100,
  nature: 72,
  trust: 62,
  economy: 68,
  resilience: 34,
  cleanEnergy: 30,
  policyLevels: {},
  history: [{ year: 2026, temperature: BASELINE_WARMING_C, emissions: 42.2, nature: 72, trust: 62 }],
  lastReport: '2023–2025 평균 +1.48°C. 이미 뜨거워진 행성의 운영 권한이 이양되었습니다.',
  gameOver: false,
}

function addEffects(target: Required<Effects>, source: Effects, multiplier = 1) {
  target.emissions += (source.emissions ?? 0) * multiplier
  target.nature += (source.nature ?? 0) * multiplier
  target.trust += (source.trust ?? 0) * multiplier
  target.economy += (source.economy ?? 0) * multiplier
  target.resilience += (source.resilience ?? 0) * multiplier
  target.funds += (source.funds ?? 0) * multiplier
  target.cleanEnergy += (source.cleanEnergy ?? 0) * multiplier
}

export function getEventForTurn(turn: number) {
  return EVENTS[turn % EVENTS.length]
}

export function getPolicyCost(policyIds: string[]) {
  return [...new Set(policyIds)].reduce((total, id) => total + (POLICIES.find((policy) => policy.id === id)?.cost ?? 0), 0)
}

export function advanceSimulation(
  state: SimulationState,
  policyIds: string[],
  eventChoiceId: string,
): SimulationState {
  if (state.gameOver) return state

  const worldEvent = getEventForTurn(state.turn)
  const eventChoice = worldEvent.choices.find((choice) => choice.id === eventChoiceId)
  if (!eventChoice) return state

  const effects: Required<Effects> = {
    emissions: 0,
    nature: 0,
    trust: 0,
    economy: 0,
    resilience: 0,
    funds: 0,
    cleanEnergy: 0,
  }

  const nextLevels = { ...state.policyLevels }
  let policyCost = 0

  let remainingFunds = state.funds
  ;[...new Set(policyIds)].forEach((id) => {
    const policy = POLICIES.find((candidate) => candidate.id === id)
    if (!policy) return
    const currentLevel = nextLevels[id] ?? 0
    if (currentLevel >= policy.maxLevel || policy.cost > remainingFunds) return
    policyCost += policy.cost
    remainingFunds -= policy.cost
    addEffects(effects, policy.effects, Math.max(0.7, 1 - currentLevel * 0.12))
    nextLevels[id] = currentLevel + 1
  })

  addEffects(effects, eventChoice.effects)

  const nextEmissions = clamp(state.emissions + effects.emissions, -3, 65)
  const warmingFromCarbon = nextEmissions >= 0
    ? nextEmissions * 5 * 0.00045
    : nextEmissions * 5 * 0.00016
  const feedback = state.temperature >= 2.5 ? 0.018 : state.temperature >= 2 ? 0.011 : state.temperature >= 1.5 ? 0.004 : 0
  const nextTemperature = clamp(state.temperature + warmingFromCarbon + feedback, 1.15, 5)
  const climateDamage = Math.max(0, nextTemperature - 1.35)
  const passiveNatureLoss = climateDamage * 1.1
  const passiveTrustLoss = Math.max(0, nextTemperature - 1.75) * 0.7
  const nextEconomy = clamp(state.economy + effects.economy - climateDamage * 0.45, 0, 100)
  const replenishment = 14 + nextEconomy * 0.11
  const nextFunds = clamp(state.funds - policyCost + effects.funds + replenishment, 0, 140)
  const nextNature = clamp(state.nature + effects.nature - passiveNatureLoss, 0, 100)
  const nextTrust = clamp(state.trust + effects.trust - passiveTrustLoss, 0, 100)
  const nextResilience = clamp(state.resilience + effects.resilience - climateDamage * 0.22, 0, 100)
  const nextCleanEnergy = clamp(state.cleanEnergy + effects.cleanEnergy, 0, 100)
  const nextYear = Math.min(2126, state.year + 5)
  const gameOver = nextYear >= 2126 || nextTrust <= 0 || nextNature <= 0
  const direction = nextEmissions < state.emissions ? '감소' : nextEmissions > state.emissions ? '증가' : '유지'

  return {
    ...state,
    year: nextYear,
    turn: state.turn + 1,
    actionLog: [
      ...state.actionLog,
      { turn: state.turn, year: state.year, policyIds: [...new Set(policyIds)], eventChoiceId },
    ],
    temperature: nextTemperature,
    emissions: nextEmissions,
    funds: nextFunds,
    nature: nextNature,
    trust: nextTrust,
    economy: nextEconomy,
    resilience: nextResilience,
    cleanEnergy: nextCleanEnergy,
    policyLevels: nextLevels,
    history: [
      ...state.history,
      { year: nextYear, temperature: nextTemperature, emissions: nextEmissions, nature: nextNature, trust: nextTrust },
    ],
    lastReport: `${nextYear}년 보고: 배출은 ${direction}했고, 지구 평균기온은 +${nextTemperature.toFixed(2)}°C입니다.`,
    gameOver,
  }
}

export function projectCountry(country: CountryProfile, state: SimulationState): CountryProjection {
  const elapsed = (state.year - 2026) / 100
  const excessHeat = Math.max(0, state.temperature - 1.2)
  const adaptationBuffer = state.resilience * 0.28
  const natureBuffer = state.nature * 0.12
  const rawRisk = country.vulnerability * 0.42 + excessHeat * 34 + elapsed * 17 - adaptationBuffer - natureBuffer
  const risk = Math.round(clamp(rawRisk, 4, 99))
  const heatDays = Math.round(country.baseHeatDays + excessHeat * (18 + country.vulnerability * 0.15) + elapsed * 8 - state.resilience * 0.08)
  const seaLevelCm = Math.round(Math.max(0, elapsed * (18 + excessHeat * 34) * (0.55 + country.coastalExposure / 150)))
  const waterSecurity = Math.round(clamp(92 - risk * 0.72 + state.resilience * 0.18 + state.nature * 0.1, 4, 99))
  const status = risk < 28 ? '회복 경로' : risk < 52 ? '관리 가능한 긴장' : risk < 74 ? '위험 경계' : '생존 한계 접근'
  const narrative = risk < 35
    ? `${country.opportunity} 투자가 결실을 맺어, ${country.signatureRisk} 위험이 억제되고 있습니다.`
    : risk < 65
      ? `${country.signatureRisk}가 일상 운영비를 높이고 있습니다. ${country.opportunity} 투자가 다음 변곡점입니다.`
      : `${country.signatureRisk}가 연쇄 충격으로 번지고 있습니다. 적응과 감축을 동시에 가속해야 합니다.`

  return { risk, heatDays: Math.max(0, heatDays), seaLevelCm, waterSecurity, status, narrative }
}

export function getEnding(state: SimulationState) {
  const score = Math.round(clamp(
    1000
      - Math.max(0, state.temperature - 1.5) * 260
      + state.nature * 1.8
      + state.trust * 1.4
      + state.resilience * 1.2
      + Math.max(0, 45 - state.emissions) * 3,
    0,
    1200,
  ))

  if (state.trust <= 0) return { title: '위임의 붕괴', grade: 'D', score, description: '시민의 동의를 잃어 행성 계획이 중단됐습니다. 전환의 속도만큼 공정성이 중요했습니다.' }
  if (state.nature <= 0) return { title: '침묵한 행성', grade: 'D', score, description: '경제는 남았지만 생태계의 회복 능력이 사라졌습니다. 자연은 장식이 아니라 기반 시설입니다.' }
  if (state.temperature <= 1.8 && state.nature >= 55 && state.trust >= 45) return { title: '살아있는 2126', grade: 'S', score, description: '온난화를 억제하면서 번영과 생태 회복을 함께 달성했습니다. 인류는 지구의 관리자가 아닌 구성원으로 남았습니다.' }
  if (state.temperature <= 2.2 && state.trust >= 35) return { title: '아슬아슬한 안정', grade: 'A', score, description: '위험은 커졌지만 대응 가능한 세계를 남겼습니다. 조금 더 이른 감축이 돌이킬 수 없는 손실을 줄였을 것입니다.' }
  if (state.temperature <= 3) return { title: '적응의 세기', grade: 'B', score, description: '문명은 버텼지만 모든 세대가 더 비싼 적응 비용을 부담합니다. 생존과 정의 사이의 격차가 커졌습니다.' }
  return { title: '뜨거운 유산', grade: 'C', score, description: '행성 평균은 인간과 생태계가 익숙했던 범위를 크게 벗어났습니다. 늦은 기술보다 빠른 감축이 강했습니다.' }
}

export function findCountry(id: string) {
  return COUNTRIES.find((country) => country.id === id) ?? COUNTRIES[0]
}

function wrappedLongitudeDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 360
  return Math.min(distance, 360 - distance)
}

function continentValue(lat: number, lon: number) {
  const landMasses = [
    [47, -108, 31, 52], [18, -98, 26, 22], [-15, -61, 39, 18],
    [51, 17, 18, 27], [8, 21, 38, 25], [42, 77, 33, 72],
    [20, 105, 26, 35], [-25, 134, 17, 24], [-78, 0, 13, 180],
  ]
  let value = -1
  for (const [centerLat, centerLon, latRadius, lonRadius] of landMasses) {
    const dLat = (lat - centerLat) / latRadius
    const dLon = wrappedLongitudeDistance(lon, centerLon) / lonRadius
    value = Math.max(value, 1 - dLat * dLat - dLon * dLon)
  }
  const edgeNoise = Math.sin(degrees(lon * 4.7 + lat * 2.1)) * 0.12
    + Math.cos(degrees(lon * 8.3 - lat * 5.2)) * 0.08
  return value + edgeNoise
}

function closestCountry(lat: number, lon: number) {
  let winner = 0
  let bestDistance = Number.POSITIVE_INFINITY
  COUNTRIES.forEach((country, index) => {
    const distance = angularDistance(lat, lon, country.lat, country.lon)
    if (distance < bestDistance) {
      winner = index
      bestDistance = distance
    }
  })
  return winner
}

/** Builds a deterministic 5,000-cell baseline whose population unit is one million people. */
export function createWorld(cellCount = WORLD_CELL_COUNT, seed = INITIAL_STATE.seed): WorldSnapshot {
  const latitude = new Float32Array(cellCount)
  const longitude = new Float32Array(cellCount)
  const land = new Uint8Array(cellCount)
  const biome = new Uint8Array(cellCount)
  const temperature = new Float32Array(cellCount)
  const population = new Float32Array(cellCount)
  const cohortYoung = new Float32Array(cellCount)
  const cohortWorking = new Float32Array(cellCount)
  const cohortSenior = new Float32Array(cellCount)
  const food = new Float32Array(cellCount)
  const water = new Float32Array(cellCount)
  const economy = new Float32Array(cellCount)
  const housingCost = new Float32Array(cellCount)
  const habitability = new Float32Array(cellCount)
  const migrationPressure = new Float32Array(cellCount)
  const cityState = new Uint8Array(cellCount)
  const disaster = new Uint8Array(cellCount)
  const countryIndex = new Uint8Array(cellCount)
  let rawPopulation = 0

  for (let index = 0; index < cellCount; index += 1) {
    const y = 1 - (index / Math.max(1, cellCount - 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = Math.PI * (3 - Math.sqrt(5)) * index
    const lat = Math.asin(y) * 180 / Math.PI
    const lon = Math.atan2(Math.sin(theta) * radius, Math.cos(theta) * radius) * 180 / Math.PI
    const isLand = continentValue(lat, lon) > 0.08
    const arid = Math.abs(lat) < 35 && Math.abs(Math.sin(degrees(lon * 1.8 + lat))) > 0.64
    const tropical = Math.abs(lat) < 24
    const polar = Math.abs(lat) > 64
    const localTemperature = 27 - Math.abs(lat) * 0.46 + seeded(index, 0, seed) * 3
    const localWater = isLand
      ? clamp(72 - Math.abs(localTemperature - 16) * 1.4 - (arid ? 31 : 0) + seeded(index + 91, 0, seed) * 18, 18, 96)
      : 100
    const nearestCountry = closestCountry(lat, lon)
    const cityPull = COUNTRIES.reduce((sum, country) => {
      const distance = angularDistance(lat, lon, country.lat, country.lon)
      return sum + Math.exp(-(distance * distance) / 0.018) * (1 + (100 - country.vulnerability) / 120)
    }, 0)
    const localPopulation = isLand ? 0.25 + cityPull * 24 + seeded(index + 33, 0, seed) * 1.4 : 0

    latitude[index] = lat
    longitude[index] = lon
    land[index] = isLand ? 1 : 0
    biome[index] = !isLand ? 0 : polar ? 5 : arid ? 3 : tropical ? 2 : Math.abs(lat) < 45 ? 1 : 4
    temperature[index] = localTemperature
    population[index] = localPopulation
    food[index] = isLand ? clamp(localWater * 0.82 + seeded(index + 17, 0, seed) * 20, 25, 100) : 0
    water[index] = localWater
    economy[index] = isLand ? clamp(28 + seeded(index + 47, 0, seed) * 47 + cityPull * 8, 1, 100) : 0
    housingCost[index] = isLand ? clamp(35 + cityPull * 18 + seeded(index + 52, 0, seed) * 20, 8, 180) : 0
    habitability[index] = isLand ? 0.62 : 0
    countryIndex[index] = nearestCountry
    rawPopulation += localPopulation
  }

  const populationScale = rawPopulation > 0 ? 8200 / rawPopulation : 0
  for (let index = 0; index < cellCount; index += 1) {
    population[index] *= populationScale
    const vulnerability = COUNTRIES[countryIndex[index]]?.vulnerability ?? 50
    const isRapidlyAgeing = countryIndex[index] === 0 || countryIndex[index] === 1
    const youngShare = isRapidlyAgeing ? 0.18 : clamp(0.2 + vulnerability * 0.00075, 0.2, 0.29)
    const seniorShare = isRapidlyAgeing ? 0.25 : clamp(0.2 - vulnerability * 0.00065, 0.13, 0.2)
    cohortYoung[index] = population[index] * youngShare
    cohortSenior[index] = population[index] * seniorShare
    cohortWorking[index] = population[index] - cohortYoung[index] - cohortSenior[index]
    cityState[index] = population[index] >= 8 ? 2 : 0
  }

  return {
    cellCount,
    latitude,
    longitude,
    land,
    biome,
    temperature,
    population,
    cohortYoung,
    cohortWorking,
    cohortSenior,
    food,
    water,
    economy,
    housingCost,
    habitability,
    migrationPressure,
    cityState,
    disaster,
    countryIndex,
  }
}

export function cloneWorld(source: WorldSnapshot): WorldSnapshot {
  return {
    cellCount: source.cellCount,
    latitude: new Float32Array(source.latitude),
    longitude: new Float32Array(source.longitude),
    land: new Uint8Array(source.land),
    biome: new Uint8Array(source.biome),
    temperature: new Float32Array(source.temperature),
    population: new Float32Array(source.population),
    cohortYoung: new Float32Array(source.cohortYoung),
    cohortWorking: new Float32Array(source.cohortWorking),
    cohortSenior: new Float32Array(source.cohortSenior),
    food: new Float32Array(source.food),
    water: new Float32Array(source.water),
    economy: new Float32Array(source.economy),
    housingCost: new Float32Array(source.housingCost),
    habitability: new Float32Array(source.habitability),
    migrationPressure: new Float32Array(source.migrationPressure),
    cityState: new Uint8Array(source.cityState),
    disaster: new Uint8Array(source.disaster),
    countryIndex: new Uint8Array(source.countryIndex),
  }
}

export function worldTransferables(snapshot: WorldSnapshot): ArrayBuffer[] {
  return [
    snapshot.latitude.buffer, snapshot.longitude.buffer, snapshot.land.buffer, snapshot.biome.buffer,
    snapshot.temperature.buffer, snapshot.population.buffer, snapshot.cohortYoung.buffer,
    snapshot.cohortWorking.buffer, snapshot.cohortSenior.buffer, snapshot.food.buffer,
    snapshot.water.buffer, snapshot.economy.buffer, snapshot.housingCost.buffer,
    snapshot.habitability.buffer, snapshot.migrationPressure.buffer, snapshot.cityState.buffer,
    snapshot.disaster.buffer, snapshot.countryIndex.buffer,
  ] as ArrayBuffer[]
}

/**
 * Advances local climate and civilization by one five-year turn. The arrays are cloned once,
 * updated in place, and returned ready for transfer from the Web Worker.
 */
export function advanceWorld(
  previous: WorldSnapshot,
  previousGlobal: SimulationState,
  nextGlobal: SimulationState,
): { world: WorldSnapshot; migration: MigrationSummary } {
  const next = cloneWorld(previous)
  new ClimateSystem().advance(next, previousGlobal, nextGlobal)
  new ResourceSystem().advance(next, nextGlobal)
  const migration = new MigrationSystem().advance(previous, next)
  const cities = new CitySystem().advance(previous, next)

  return {
    world: next,
    migration: { ...migration, ...cities },
  }
}

export class EarthSimulation {
  private globalState: SimulationState
  private world: WorldSnapshot
  private readonly climateSystem = new ClimateSystem()
  private readonly resourceSystem = new ResourceSystem()
  private readonly migrationSystem = new MigrationSystem()
  private readonly citySystem = new CitySystem()

  constructor(globalState: SimulationState = INITIAL_STATE, world?: WorldSnapshot) {
    this.globalState = structuredClone(globalState)
    this.world = world ? cloneWorld(world) : createWorld(WORLD_CELL_COUNT, globalState.seed)
  }

  reset() {
    this.globalState = structuredClone(INITIAL_STATE)
    this.world = createWorld(WORLD_CELL_COUNT, INITIAL_STATE.seed)
  }

  restore(globalState: SimulationState, world: WorldSnapshot) {
    this.globalState = structuredClone(globalState)
    this.world = cloneWorld(world)
  }

  step(policyIds: string[], eventChoiceId: string) {
    const previousGlobal = this.globalState
    const nextGlobal = advanceSimulation(previousGlobal, policyIds, eventChoiceId)
    if (nextGlobal === previousGlobal) throw new Error('현재 턴에 맞는 정책과 사건 선택을 확인해 주세요.')

    const previousWorld = this.world
    const nextWorld = cloneWorld(previousWorld)
    this.climateSystem.advance(nextWorld, previousGlobal, nextGlobal)
    this.resourceSystem.advance(nextWorld, nextGlobal)
    const migration = this.migrationSystem.advance(previousWorld, nextWorld)
    const cities = this.citySystem.advance(previousWorld, nextWorld)
    this.globalState = nextGlobal
    this.world = nextWorld
    return { ...migration, ...cities }
  }

  snapshot() {
    return {
      global: structuredClone(this.globalState),
      world: cloneWorld(this.world),
    }
  }
}
