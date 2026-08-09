import { describe, expect, it } from 'vitest'
import { INITIAL_STATE } from './simulation'
import { createLeaderboardEntry } from './leaderboard'

describe('leaderboard entry', () => {
  it('captures survival and the most-used policy strategy', () => {
    const entry = createLeaderboardEntry({
      ...INITIAL_STATE,
      year: 2126,
      gameOver: true,
      policyLevels: { 'solar-cities': 3, rewild: 2 },
    }, '  EARTHKEEPER  ')

    expect(entry.callsign).toBe('EARTHKEEPER')
    expect(entry.endYear).toBe(2126)
    expect(entry.strategy).toEqual(['태양 도시', '야생 회랑'])
  })
})
