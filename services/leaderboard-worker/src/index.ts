import { ReplayError, SCENARIO_ID } from './domain'
import { LeaderboardStore, SubmissionConflictError } from './store'
import { ValidationError, isUuidV4, validateSubmission } from './validation'

export interface Env {
  DB: D1Database
  RATE_LIMITER?: RateLimit
  SEASON_ID?: string
  SCENARIO_ID?: string
  ALLOWED_SEEDS?: string
  EXTRA_ALLOWED_ORIGINS?: string
}

const MAX_BODY_BYTES = 32 * 1024
const DEFAULT_ORIGINS = [
  'https://sdj3261.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

function safeOrigin(value: string) {
  try {
    const url = new URL(value)
    return url.origin === value && (url.protocol === 'https:' || url.protocol === 'http:') ? value : null
  } catch {
    return null
  }
}

export function allowedOrigins(env: Env) {
  const extras = (env.EXTRA_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  return new Set([...DEFAULT_ORIGINS, ...extras.map(safeOrigin).filter((value): value is string => value !== null)])
}

function responseHeaders(origin?: string) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'cross-origin',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    vary: 'Origin',
  })
  if (origin) headers.set('access-control-allow-origin', origin)
  return headers
}

function json(value: unknown, status = 200, origin?: string, cacheControl = 'no-store') {
  const headers = responseHeaders(origin)
  headers.set('cache-control', cacheControl)
  return new Response(JSON.stringify(value), { status, headers })
}

function errorResponse(error: unknown, origin?: string) {
  if (error instanceof ApiError) {
    const response = json({ error: error.code, message: error.message, verified: false }, error.status, origin)
    if (error.status === 429) response.headers.set('retry-after', '60')
    if (error.status === 405) response.headers.set('allow', 'GET, POST, OPTIONS')
    return response
  }
  if (error instanceof ValidationError || error instanceof ReplayError) {
    return json({ error: error.code, message: error.message, verified: false }, 422, origin)
  }
  if (error instanceof SubmissionConflictError) {
    return json({ error: 'idempotency_conflict', message: error.message, verified: false }, 409, origin)
  }
  console.error('leaderboard_request_failed', error instanceof Error ? error.message : 'unknown')
  return json({ error: 'internal_error', message: 'The leaderboard is temporarily unavailable.', verified: false }, 500, origin)
}

async function readJson(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new ApiError(415, 'unsupported_media_type', 'Use application/json.')
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null) {
    const length = Number(declaredLength)
    if (!Number.isSafeInteger(length) || length < 0) throw new ApiError(400, 'invalid_content_length', 'Invalid Content-Length header.')
    if (length > MAX_BODY_BYTES) throw new ApiError(413, 'body_too_large', `Request bodies are limited to ${MAX_BODY_BYTES} bytes.`)
  }
  if (!request.body) throw new ApiError(400, 'empty_body', 'A JSON body is required.')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new ApiError(413, 'body_too_large', `Request bodies are limited to ${MAX_BODY_BYTES} bytes.`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid UTF-8 JSON.')
  }
}

function parseAllowedSeeds(value?: string) {
  const seeds = (value ?? '0').split(',').map((seed) => Number(seed.trim()))
  if (seeds.length === 0 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0)) {
    throw new ApiError(500, 'server_configuration', 'ALLOWED_SEEDS is invalid.')
  }
  return new Set(seeds)
}

function actorKey(request: Request) {
  const playerId = request.headers.get('x-gaia-player-id')
  if (playerId && isUuidV4(playerId)) return `player:${playerId}`
  return `network:${request.headers.get('cf-connecting-ip') ?? 'local'}`
}

async function enforceRateLimit(request: Request, env: Env) {
  if (!env.RATE_LIMITER) throw new ApiError(503, 'rate_limit_unavailable', 'The leaderboard is temporarily unavailable.')
  const route = request.method === 'POST' ? 'write' : 'read'
  const result = await env.RATE_LIMITER.limit({ key: `${route}:${actorKey(request)}` })
  if (!result.success) throw new ApiError(429, 'rate_limited', 'Too many leaderboard requests. Retry shortly.')
}

async function handleLeaderboard(request: Request, env: Env, origin?: string) {
  await enforceRateLimit(request, env)
  const store = new LeaderboardStore(env.DB)
  const seasonId = (env.SEASON_ID ?? 'challenge-2026').trim()
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(seasonId)) throw new ApiError(500, 'server_configuration', 'SEASON_ID is invalid.')
  const scenarioId = (env.SCENARIO_ID ?? SCENARIO_ID).trim()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(scenarioId)) throw new ApiError(500, 'server_configuration', 'SCENARIO_ID is invalid.')

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const rawLimit = url.searchParams.get('limit') ?? '50'
    if (!/^\d{1,2}$/.test(rawLimit)) throw new ApiError(400, 'invalid_limit', 'limit must be an integer from 1 to 50.')
    const limit = Number(rawLimit)
    if (limit < 1 || limit > 50) throw new ApiError(400, 'invalid_limit', 'limit must be an integer from 1 to 50.')
    return json(await store.list(seasonId, limit), 200, origin, 'public, max-age=15, stale-while-revalidate=60')
  }

  if (request.method === 'POST') {
    const payload = await readJson(request)
    const submission = validateSubmission(payload, {
      scenarioId,
      allowedSeeds: parseAllowedSeeds(env.ALLOWED_SEEDS),
    })
    const idempotencyKey = request.headers.get('idempotency-key')
    if (idempotencyKey && idempotencyKey !== submission.clientSubmissionId) {
      throw new ApiError(400, 'idempotency_key_mismatch', 'Idempotency-Key must match entry.id.')
    }
    return json(await store.save(submission, seasonId), 200, origin)
  }

  throw new ApiError(405, 'method_not_allowed', 'Only GET, POST, and OPTIONS are supported.')
}

export async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url)
  const pathname = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname
  const requestOrigin = request.headers.get('origin')
  const origin = requestOrigin && allowedOrigins(env).has(requestOrigin) ? requestOrigin : undefined
  if (requestOrigin && !origin) return json({ error: 'origin_forbidden', message: 'This browser origin is not allowed.', verified: false }, 403)
  if (pathname !== '/leaderboard') return json({ error: 'not_found', message: 'Route not found.', verified: false }, 404, origin)

  if (request.method === 'OPTIONS') {
    const headers = responseHeaders(origin)
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
    headers.set('access-control-allow-headers', 'Content-Type, Idempotency-Key, X-Gaia-Player-Id')
    headers.set('access-control-max-age', '86400')
    headers.set('cache-control', 'public, max-age=86400')
    return new Response(null, { status: 204, headers })
  }

  try {
    return await handleLeaderboard(request, env, origin)
  } catch (error) {
    return errorResponse(error, origin)
  }
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>
