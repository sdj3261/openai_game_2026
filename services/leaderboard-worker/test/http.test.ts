import { describe, expect, it } from 'vitest'
import { handleRequest, type Env } from '../src/index'

const env = {
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as Env

describe('HTTP boundary', () => {
  it('answers an allowed CORS preflight', async () => {
    const response = await handleRequest(new Request('https://api.example/leaderboard', {
      method: 'OPTIONS',
      headers: { origin: 'https://sdj3261.github.io' },
    }), env)

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://sdj3261.github.io')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('rejects an unlisted browser origin without reflecting it', async () => {
    const response = await handleRequest(new Request('https://api.example/leaderboard', {
      headers: { origin: 'https://attacker.example' },
    }), env)

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects oversized JSON before touching D1', async () => {
    const response = await handleRequest(new Request('https://api.example/leaderboard', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        'content-length': String(33 * 1024),
      },
      body: '{}',
    }), env)

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: 'body_too_large', verified: false })
  })

  it('fails closed when the production rate-limit binding is missing', async () => {
    const response = await handleRequest(new Request('https://api.example/leaderboard', {
      headers: { origin: 'http://localhost:5173' },
    }), {} as Env)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'rate_limit_unavailable', verified: false })
  })
})
