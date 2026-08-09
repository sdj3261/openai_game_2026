import {
  MAX_TURNS,
  SCENARIO_ID,
  SIMULATION_VERSION,
  replay,
  type ReplayAction,
  type ReplayProof,
  type ReplayOutcome,
} from './domain'

export interface LeaderboardEntry {
  id: string
  callsign: string
  score: number
  endYear: number
  grade: string
  temperature: number
  nature: number
  trust: number
  resilience: number
  strategy: string[]
  submittedAt: string
  verified: boolean
}

export interface ValidatedSubmission {
  clientSubmissionId: string
  callsign: string
  proof: ReplayProof
  outcome: ReplayOutcome
}

export interface ValidationConfig {
  scenarioId?: string
  allowedSeeds?: ReadonlySet<number>
}

export class ValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new ValidationError('invalid_field', `${field} must be a non-empty string no longer than ${maxLength} characters.`)
  }
  return value
}

function finiteNumber(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError('invalid_field', `${field} must be a finite number between ${min} and ${max}.`)
  }
  return value
}

function integer(value: unknown, field: string, min: number, max: number) {
  const number = finiteNumber(value, field, min, max)
  if (!Number.isInteger(number)) throw new ValidationError('invalid_field', `${field} must be an integer.`)
  return number
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FORBIDDEN_DIRECTIONAL_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
const DISALLOWED_CALLSIGN_CHARACTERS = /[^\p{L}\p{N} ._-]/gu

function replaceControlCharacters(value: string) {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character
  }).join('')
}

export function sanitizeCallsign(value: unknown) {
  if (typeof value !== 'string' || value.length > 128) {
    throw new ValidationError('invalid_callsign', 'callsign must be a string no longer than 128 input characters.')
  }
  const normalized = replaceControlCharacters(value
    .normalize('NFKC')
    .replace(FORBIDDEN_DIRECTIONAL_CONTROLS, ''))
    .replace(DISALLOWED_CALLSIGN_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
  return [...normalized].slice(0, 18).join('') || 'ANONYMOUS'
}

function parseAction(value: unknown, index: number): ReplayAction {
  if (!isRecord(value)) throw new ValidationError('invalid_action', `actions[${index}] must be an object.`)
  if (!Array.isArray(value.policyIds) || value.policyIds.length < 1 || value.policyIds.length > 2) {
    throw new ValidationError('invalid_action', `actions[${index}].policyIds must contain one or two values.`)
  }
  const policyIds = value.policyIds.map((id, policyIndex) => requiredString(id, `actions[${index}].policyIds[${policyIndex}]`, 40))
  return {
    turn: integer(value.turn, `actions[${index}].turn`, 0, MAX_TURNS - 1),
    year: integer(value.year, `actions[${index}].year`, 2026, 2126),
    policyIds,
    eventChoiceId: requiredString(value.eventChoiceId, `actions[${index}].eventChoiceId`, 40),
  }
}

function parseProof(value: unknown, config: ValidationConfig): ReplayProof {
  if (!isRecord(value)) throw new ValidationError('invalid_proof', 'proof must be an object.')
  const simulationVersion = integer(value.simulationVersion, 'proof.simulationVersion', 1, 1000)
  if (simulationVersion !== SIMULATION_VERSION) {
    throw new ValidationError('unsupported_version', `Only simulation version ${SIMULATION_VERSION} is accepted.`)
  }
  const seed = integer(value.seed, 'proof.seed', 0, Number.MAX_SAFE_INTEGER)
  const allowedSeeds = config.allowedSeeds ?? new Set([0])
  if (!allowedSeeds.has(seed)) throw new ValidationError('seed_not_allowed', 'This seed is not open for the current season.')

  const expectedScenario = config.scenarioId ?? SCENARIO_ID
  const scenarioId = value.scenarioId === undefined
    ? expectedScenario
    : requiredString(value.scenarioId, 'proof.scenarioId', 64)
  if (scenarioId !== expectedScenario) throw new ValidationError('scenario_not_allowed', 'This scenario is not open for the current season.')
  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > MAX_TURNS) {
    throw new ValidationError('invalid_proof', `proof.actions must contain between 1 and ${MAX_TURNS} turns.`)
  }

  return { simulationVersion, scenarioId, seed, actions: value.actions.map(parseAction) }
}

function parseEntry(value: unknown) {
  if (!isRecord(value)) throw new ValidationError('invalid_entry', 'entry must be an object.')
  const id = requiredString(value.id, 'entry.id', 36)
  if (!UUID_V4.test(id)) throw new ValidationError('invalid_entry', 'entry.id must be a UUID v4.')
  if (value.verified !== false) throw new ValidationError('invalid_entry', 'A client submission must set entry.verified to false.')
  if (!Array.isArray(value.strategy) || value.strategy.length > 3 || value.strategy.some((tag) => typeof tag !== 'string' || tag.length > 40)) {
    throw new ValidationError('invalid_entry', 'entry.strategy must contain at most three short strings.')
  }
  const submittedAt = requiredString(value.submittedAt, 'entry.submittedAt', 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(submittedAt) || !Number.isFinite(Date.parse(submittedAt))) {
    throw new ValidationError('invalid_entry', 'entry.submittedAt must be an ISO timestamp.')
  }

  return {
    id,
    callsign: sanitizeCallsign(value.callsign),
    score: integer(value.score, 'entry.score', 0, 1200),
    endYear: integer(value.endYear, 'entry.endYear', 2026, 2126),
    grade: requiredString(value.grade, 'entry.grade', 1),
    temperature: finiteNumber(value.temperature, 'entry.temperature', 1, 5),
    nature: integer(value.nature, 'entry.nature', 0, 100),
    trust: integer(value.trust, 'entry.trust', 0, 100),
    resilience: integer(value.resilience, 'entry.resilience', 0, 100),
    strategy: value.strategy as string[],
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function validateSubmission(value: unknown, config: ValidationConfig = {}): ValidatedSubmission {
  if (!isRecord(value)) throw new ValidationError('invalid_body', 'The request body must be a JSON object.')
  const entry = parseEntry(value.entry)
  const proof = parseProof(value.proof, config)
  const outcome = replay(proof)
  const expected = {
    score: outcome.score,
    endYear: outcome.state.year,
    grade: outcome.grade,
    temperature: Number(outcome.state.temperature.toFixed(2)),
    nature: Math.round(outcome.state.nature),
    trust: Math.round(outcome.state.trust),
    resilience: Math.round(outcome.state.resilience),
    strategy: outcome.strategy,
  }

  const matches = entry.score === expected.score
    && entry.endYear === expected.endYear
    && entry.grade === expected.grade
    && entry.temperature === expected.temperature
    && entry.nature === expected.nature
    && entry.trust === expected.trust
    && entry.resilience === expected.resilience
    && arraysEqual(entry.strategy, expected.strategy)
  if (!matches) {
    throw new ValidationError('proof_mismatch', 'The submitted result does not match the deterministic server replay.')
  }

  return { clientSubmissionId: entry.id, callsign: entry.callsign, proof, outcome }
}

export function isUuidV4(value: string) {
  return UUID_V4.test(value)
}
