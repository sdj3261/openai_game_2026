import { SCENARIO_ID, SIMULATION_VERSION, replay, type ReplayProof } from '../src/domain'

const policyIds = [
  'solar-cities', 'solar-cities', 'solar-cities',
  'rewild', 'rewild', 'rewild',
  'living-farms', 'living-farms', 'living-farms',
  'climate-dividend', 'climate-dividend', 'climate-dividend',
  'migration-compact', 'migration-compact', 'migration-compact',
  'sponge-cities', 'sponge-cities', 'sponge-cities',
  'zero-transit', 'zero-transit',
]

const eventChoiceIds = [
  'coalition',
  'cooling',
  'license',
  'restore',
  'corridor',
  'guardrails',
  'dividend',
  'residual',
]

export const goldenProof: ReplayProof = {
  simulationVersion: SIMULATION_VERSION,
  scenarioId: SCENARIO_ID,
  seed: 0,
  actions: policyIds.map((policyId, turn) => ({
    turn,
    year: 2026 + turn * 5,
    policyIds: [policyId],
    eventChoiceId: eventChoiceIds[turn % eventChoiceIds.length],
  })),
}

export function validPayload(overrides: Record<string, unknown> = {}) {
  const outcome = replay(goldenProof)
  return {
    entry: {
      id: 'dc7192d4-65cf-4b36-9ad9-9f576f6c55ec',
      callsign: '  EARTHKEEPER  ',
      score: outcome.score,
      endYear: outcome.state.year,
      grade: outcome.grade,
      temperature: Number(outcome.state.temperature.toFixed(2)),
      nature: Math.round(outcome.state.nature),
      trust: Math.round(outcome.state.trust),
      resilience: Math.round(outcome.state.resilience),
      strategy: outcome.strategy,
      submittedAt: '2026-08-10T00:00:00.000Z',
      verified: false,
    },
    proof: goldenProof,
    ...overrides,
  }
}
