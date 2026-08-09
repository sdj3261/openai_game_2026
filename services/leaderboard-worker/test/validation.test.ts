import { describe, expect, it } from 'vitest'
import { sanitizeCallsign, validateSubmission, ValidationError } from '../src/validation'
import { validPayload } from './fixtures'

describe('submission validation', () => {
  it('normalizes the callsign and accepts a replay-identical result', () => {
    const result = validateSubmission(validPayload())
    expect(result.callsign).toBe('EARTHKEEPER')
    expect(result.outcome.state.year).toBe(2126)
  })

  it('rejects a claimed score that does not match replay', () => {
    const payload = validPayload()
    payload.entry.score -= 1
    expect(() => validateSubmission(payload)).toThrowError(ValidationError)
    expect(() => validateSubmission(payload)).toThrow(/does not match/i)
  })

  it('rejects a seed outside the season allowlist', () => {
    const payload = validPayload()
    payload.proof = { ...payload.proof, seed: 7 }
    expect(() => validateSubmission(payload, { allowedSeeds: new Set([0]) })).toThrow(/not open/i)
  })

  it('removes markup, controls, and directional overrides from callsigns', () => {
    expect(sanitizeCallsign('  <b>\u202eBLUE\n지구</b>  ')).toBe('bBLUE 지구b')
    expect(sanitizeCallsign('✨')).toBe('ANONYMOUS')
  })
})
