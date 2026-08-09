import { RULESET_ID, type ReplayProof } from './domain'
import type { LeaderboardEntry, ValidatedSubmission } from './validation'

interface RunRow {
  id: string
  client_submission_id: string
  callsign: string
  score: number
  end_year: number
  grade: string
  temperature: number
  nature: number
  trust: number
  resilience: number
  strategy_json: string
  submitted_at: string
  verified: number
  proof_sha256: string
}

export class SubmissionConflictError extends Error {
  constructor() {
    super('The idempotency key was already used for a different submission.')
    this.name = 'SubmissionConflictError'
  }
}

function toEntry(row: RunRow): LeaderboardEntry {
  let strategy: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.strategy_json)
    if (Array.isArray(parsed)) strategy = parsed.filter((value): value is string => typeof value === 'string').slice(0, 3)
  } catch {
    // A damaged row remains readable without injecting arbitrary values into the response.
  }
  return {
    id: row.id,
    callsign: row.callsign,
    score: row.score,
    endYear: row.end_year,
    grade: row.grade,
    temperature: row.temperature,
    nature: row.nature,
    trust: row.trust,
    resilience: row.resilience,
    strategy,
    submittedAt: row.submitted_at,
    verified: row.verified === 1,
  }
}

export function canonicalProof(proof: ReplayProof) {
  return JSON.stringify({
    simulationVersion: proof.simulationVersion,
    scenarioId: proof.scenarioId,
    seed: proof.seed,
    actions: proof.actions.map((action) => ({
      turn: action.turn,
      year: action.year,
      policyIds: action.policyIds,
      eventChoiceId: action.eventChoiceId,
    })),
  })
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class LeaderboardStore {
  constructor(private readonly db: D1Database) {}

  async list(seasonId: string, limit: number) {
    const rows = await this.db.prepare(`
      SELECT id, client_submission_id, callsign, score, end_year, grade,
             temperature, nature, trust, resilience, strategy_json,
             submitted_at, verified, proof_sha256
      FROM leaderboard_runs
      WHERE season_id = ?1 AND verified = 1
      ORDER BY verified DESC, end_year DESC, score DESC, temperature ASC, submitted_at ASC
      LIMIT ?2
    `).bind(seasonId, limit).all<RunRow>()
    return rows.results.map(toEntry)
  }

  async save(submission: ValidatedSubmission, seasonId: string, now = new Date()) {
    const proofJson = canonicalProof(submission.proof)
    const proofHash = await sha256(proofJson)
    const id = crypto.randomUUID()
    const submittedAt = now.toISOString()
    const state = submission.outcome.state
    const entry: LeaderboardEntry = {
      id,
      callsign: submission.callsign,
      score: submission.outcome.score,
      endYear: state.year,
      grade: submission.outcome.grade,
      temperature: Number(state.temperature.toFixed(2)),
      nature: Math.round(state.nature),
      trust: Math.round(state.trust),
      resilience: Math.round(state.resilience),
      strategy: submission.outcome.strategy,
      submittedAt,
      verified: true,
    }

    const result = await this.db.prepare(`
      INSERT INTO leaderboard_runs (
        id, client_submission_id, season_id, scenario_id, simulation_version,
        ruleset_id, seed, proof_json, proof_sha256, callsign, score, end_year,
        grade, temperature, nature, trust, resilience, strategy_json,
        verified, submitted_at, verified_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
        ?13, ?14, ?15, ?16, ?17, ?18, 1, ?19, ?19
      ) ON CONFLICT(season_id, client_submission_id) DO NOTHING
    `).bind(
      id,
      submission.clientSubmissionId,
      seasonId,
      submission.proof.scenarioId,
      submission.proof.simulationVersion,
      RULESET_ID,
      submission.proof.seed,
      proofJson,
      proofHash,
      entry.callsign,
      entry.score,
      entry.endYear,
      entry.grade,
      entry.temperature,
      entry.nature,
      entry.trust,
      entry.resilience,
      JSON.stringify(entry.strategy),
      submittedAt,
    ).run()

    if ((result.meta.changes ?? 0) > 0) return entry

    const existing = await this.db.prepare(`
      SELECT id, client_submission_id, callsign, score, end_year, grade,
             temperature, nature, trust, resilience, strategy_json,
             submitted_at, verified, proof_sha256
      FROM leaderboard_runs WHERE season_id = ?1 AND client_submission_id = ?2
    `).bind(seasonId, submission.clientSubmissionId).first<RunRow>()
    if (!existing || existing.proof_sha256 !== proofHash || existing.callsign !== submission.callsign) {
      throw new SubmissionConflictError()
    }
    return toEntry(existing)
  }
}
