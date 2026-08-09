export const SIMULATION_VERSION = 1
export const RULESET_ID = 'gaia-global-v1-2026-08-10'
export const SCENARIO_ID = 'earth-2026-standard'
export const MAX_TURNS = 20

type Effects = Partial<{
  emissions: number
  nature: number
  trust: number
  economy: number
  resilience: number
  funds: number
  cleanEnergy: number
}>

interface Policy {
  id: string
  shortName: string
  cost: number
  maxLevel: number
  effects: Effects
}

interface EventChoice {
  id: string
  effects: Effects
}

interface WorldEvent {
  id: string
  choices: readonly EventChoice[]
}

export interface ReplayAction {
  turn: number
  year: number
  policyIds: string[]
  eventChoiceId: string
}

export interface ReplayProof {
  simulationVersion: number
  scenarioId: string
  seed: number
  actions: ReplayAction[]
}

export interface SimulationState {
  year: number
  turn: number
  temperature: number
  emissions: number
  funds: number
  nature: number
  trust: number
  economy: number
  resilience: number
  cleanEnergy: number
  policyLevels: Record<string, number>
  gameOver: boolean
}

export interface ReplayOutcome {
  state: SimulationState
  score: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
  strategy: string[]
}

export class ReplayError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ReplayError'
  }
}

const POLICIES: readonly Policy[] = [
  { id: 'solar-cities', shortName: '태양 도시', cost: 18, maxLevel: 3, effects: { emissions: -3.2, cleanEnergy: 8, economy: 1 } },
  { id: 'planetary-grid', shortName: '행성 전력망', cost: 24, maxLevel: 3, effects: { emissions: -4.5, cleanEnergy: 11, economy: 2, trust: -1 } },
  { id: 'coal-exit', shortName: '석탄 퇴장', cost: 16, maxLevel: 3, effects: { emissions: -5.8, cleanEnergy: 4, economy: -2, trust: -3 } },
  { id: 'rewild', shortName: '야생 회랑', cost: 14, maxLevel: 3, effects: { emissions: -1.4, nature: 9, resilience: 3, trust: 2 } },
  { id: 'zero-transit', shortName: '15분 생활권', cost: 17, maxLevel: 3, effects: { emissions: -2.5, trust: 5, economy: 1, cleanEnergy: 2 } },
  { id: 'living-farms', shortName: '살아있는 농장', cost: 13, maxLevel: 3, effects: { emissions: -1.2, nature: 6, resilience: 5, trust: 1 } },
  { id: 'sponge-cities', shortName: '스펀지 도시', cost: 20, maxLevel: 3, effects: { resilience: 10, nature: 2, economy: 1, trust: 2 } },
  { id: 'climate-dividend', shortName: '기후 배당', cost: 11, maxLevel: 3, effects: { emissions: -1.8, trust: 8, economy: -1 } },
  { id: 'advanced-nuclear', shortName: '차세대 원자력', cost: 23, maxLevel: 3, effects: { emissions: -4.2, cleanEnergy: 9, economy: 2, trust: -2 } },
  { id: 'desalination-loop', shortName: '순환 담수화', cost: 21, maxLevel: 3, effects: { resilience: 9, cleanEnergy: -1, economy: 1, trust: 2 } },
  { id: 'migration-compact', shortName: '이주 도시 협약', cost: 15, maxLevel: 3, effects: { resilience: 7, trust: 7, economy: 1 } },
  { id: 'carbon-removal-hubs', shortName: '탄소 제거 허브', cost: 27, maxLevel: 3, effects: { emissions: -5.1, economy: -1, cleanEnergy: -2 } },
  { id: 'care-cities', shortName: '세대 돌봄 도시', cost: 16, maxLevel: 3, effects: { resilience: 5, trust: 8, economy: -1 } },
] as const

const EVENTS: readonly WorldEvent[] = [
  { id: 'first-summit', choices: [{ id: 'binding', effects: { emissions: -2, trust: -2 } }, { id: 'coalition', effects: { cleanEnergy: 4, trust: 2 } }] },
  { id: 'heat-dome', choices: [{ id: 'cooling', effects: { funds: -9, resilience: 5, trust: 4 } }, { id: 'market', effects: { emissions: -1.5, economy: -2 } }] },
  { id: 'battery-breakthrough', choices: [{ id: 'open', effects: { funds: -10, cleanEnergy: 8, trust: 5 } }, { id: 'license', effects: { funds: 9, cleanEnergy: 4 } }] },
  { id: 'forest-fire', choices: [{ id: 'restore', effects: { funds: -12, nature: 8, resilience: 3 } }, { id: 'plantation', effects: { emissions: -1.8, nature: -3 } }] },
  { id: 'migration', choices: [{ id: 'corridor', effects: { funds: -8, trust: 9, economy: 1 } }, { id: 'border', effects: { resilience: 5, trust: -7 } }] },
  { id: 'ocean-farm', choices: [{ id: 'guardrails', effects: { nature: 5, economy: 2 } }, { id: 'scale', effects: { emissions: -2.5, economy: 4, nature: -4 } }] },
  { id: 'election', choices: [{ id: 'dividend', effects: { funds: -12, trust: 10 } }, { id: 'stay', effects: { emissions: -1.2, trust: -5, economy: 2 } }] },
  { id: 'carbon-removal', choices: [{ id: 'residual', effects: { funds: -14, emissions: -2.8, trust: 3 } }, { id: 'fullscale', effects: { emissions: -4, economy: 2, nature: -2 } }] },
] as const

const INITIAL_STATE: SimulationState = {
  year: 2026,
  turn: 0,
  temperature: 1.48,
  emissions: 42.2,
  funds: 100,
  nature: 72,
  trust: 62,
  economy: 68,
  resilience: 34,
  cleanEnergy: 30,
  policyLevels: {},
  gameOver: false,
}

const policyById = new Map(POLICIES.map((policy) => [policy.id, policy]))

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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

function advance(state: SimulationState, action: ReplayAction): SimulationState {
  if (state.gameOver) throw new ReplayError('actions_after_end', 'The proof contains actions after the run ended.')
  if (action.turn !== state.turn || action.year !== state.year) {
    throw new ReplayError('action_sequence', `Expected turn ${state.turn} in ${state.year}.`)
  }
  if (action.policyIds.length < 1 || action.policyIds.length > 2 || new Set(action.policyIds).size !== action.policyIds.length) {
    throw new ReplayError('policy_selection', 'Each turn must contain one or two unique policies.')
  }

  const worldEvent = EVENTS[state.turn % EVENTS.length]
  const eventChoice = worldEvent.choices.find((choice) => choice.id === action.eventChoiceId)
  if (!eventChoice) throw new ReplayError('event_choice', `Invalid choice for event ${worldEvent.id}.`)

  const chosenPolicies = action.policyIds.map((id) => {
    const policy = policyById.get(id)
    if (!policy) throw new ReplayError('policy_unknown', `Unknown policy: ${id}.`)
    if ((state.policyLevels[id] ?? 0) >= policy.maxLevel) {
      throw new ReplayError('policy_max_level', `Policy ${id} exceeds its maximum level.`)
    }
    return policy
  })
  const policyCost = chosenPolicies.reduce((sum, policy) => sum + policy.cost, 0)
  if (policyCost > state.funds) throw new ReplayError('policy_funds', 'Selected policies exceed available funds.')

  const effects: Required<Effects> = { emissions: 0, nature: 0, trust: 0, economy: 0, resilience: 0, funds: 0, cleanEnergy: 0 }
  const nextLevels = { ...state.policyLevels }
  for (const policy of chosenPolicies) {
    const currentLevel = nextLevels[policy.id] ?? 0
    addEffects(effects, policy.effects, Math.max(0.7, 1 - currentLevel * 0.12))
    nextLevels[policy.id] = currentLevel + 1
  }
  addEffects(effects, eventChoice.effects)

  const nextEmissions = clamp(state.emissions + effects.emissions, -3, 65)
  const warmingFromCarbon = nextEmissions >= 0 ? nextEmissions * 5 * 0.00045 : nextEmissions * 5 * 0.00016
  const feedback = state.temperature >= 2.5 ? 0.018 : state.temperature >= 2 ? 0.011 : state.temperature >= 1.5 ? 0.004 : 0
  const nextTemperature = clamp(state.temperature + warmingFromCarbon + feedback, 1.15, 5)
  const climateDamage = Math.max(0, nextTemperature - 1.35)
  const nextEconomy = clamp(state.economy + effects.economy - climateDamage * 0.45, 0, 100)
  const nextFunds = clamp(state.funds - policyCost + effects.funds + 14 + nextEconomy * 0.11, 0, 140)
  const nextNature = clamp(state.nature + effects.nature - climateDamage * 1.1, 0, 100)
  const nextTrust = clamp(state.trust + effects.trust - Math.max(0, nextTemperature - 1.75) * 0.7, 0, 100)
  const nextResilience = clamp(state.resilience + effects.resilience - climateDamage * 0.22, 0, 100)
  const nextCleanEnergy = clamp(state.cleanEnergy + effects.cleanEnergy, 0, 100)
  const nextYear = Math.min(2126, state.year + 5)

  return {
    year: nextYear,
    turn: state.turn + 1,
    temperature: nextTemperature,
    emissions: nextEmissions,
    funds: nextFunds,
    nature: nextNature,
    trust: nextTrust,
    economy: nextEconomy,
    resilience: nextResilience,
    cleanEnergy: nextCleanEnergy,
    policyLevels: nextLevels,
    gameOver: nextYear >= 2126 || nextTrust <= 0 || nextNature <= 0,
  }
}

function ending(state: SimulationState): Pick<ReplayOutcome, 'score' | 'grade'> {
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
  if (state.trust <= 0 || state.nature <= 0) return { grade: 'D', score }
  if (state.temperature <= 1.8 && state.nature >= 55 && state.trust >= 45) return { grade: 'S', score }
  if (state.temperature <= 2.2 && state.trust >= 35) return { grade: 'A', score }
  if (state.temperature <= 3) return { grade: 'B', score }
  return { grade: 'C', score }
}

export function replay(proof: ReplayProof): ReplayOutcome {
  if (proof.simulationVersion !== SIMULATION_VERSION) {
    throw new ReplayError('simulation_version', `Only simulation version ${SIMULATION_VERSION} is replayable.`)
  }
  if (proof.actions.length < 1 || proof.actions.length > MAX_TURNS) {
    throw new ReplayError('action_count', `A proof must contain between 1 and ${MAX_TURNS} turns.`)
  }

  let state: SimulationState = { ...INITIAL_STATE, policyLevels: {} }
  for (const action of proof.actions) state = advance(state, action)
  if (!state.gameOver) throw new ReplayError('run_incomplete', 'The submitted action log does not reach a terminal state.')

  const result = ending(state)
  const strategy = Object.entries(state.policyLevels)
    .sort(([, levelA], [, levelB]) => levelB - levelA)
    .slice(0, 3)
    .map(([id]) => policyById.get(id)?.shortName ?? id)

  return { state, strategy, ...result }
}

export function knownPolicyIds() {
  return POLICIES.map((policy) => policy.id)
}
