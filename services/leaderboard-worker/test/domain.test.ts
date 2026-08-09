import { describe, expect, it } from 'vitest'
import { ReplayError, replay } from '../src/domain'
import { goldenProof } from './fixtures'

describe('deterministic replay', () => {
  it('replays the golden 100-year run', () => {
    const outcome = replay(goldenProof)

    expect({
      year: outcome.state.year,
      score: outcome.score,
      grade: outcome.grade,
      temperature: Number(outcome.state.temperature.toFixed(8)),
      emissions: Number(outcome.state.emissions.toFixed(8)),
      nature: Number(outcome.state.nature.toFixed(8)),
      trust: Number(outcome.state.trust.toFixed(8)),
      resilience: Number(outcome.state.resilience.toFixed(8)),
      strategy: outcome.strategy,
    }).toEqual({
      year: 2126,
      score: 1200,
      grade: 'B',
      temperature: 2.746504,
      emissions: 11.836,
      nature: 100,
      trust: 100,
      resilience: 100,
      strategy: ['태양 도시', '야생 회랑', '살아있는 농장'],
    })
    expect(outcome.state.gameOver).toBe(true)
  })

  it('rejects a policy that exceeds its maximum level', () => {
    const tampered = structuredClone(goldenProof)
    tampered.actions[3].policyIds = ['solar-cities']

    expect(() => replay(tampered)).toThrowError(ReplayError)
    expect(() => replay(tampered)).toThrow(/maximum level/i)
  })

  it('rejects an incomplete run', () => {
    const incomplete = { ...goldenProof, actions: goldenProof.actions.slice(0, 3) }
    expect(() => replay(incomplete)).toThrow(/terminal state/i)
  })
})
