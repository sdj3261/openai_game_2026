import type { SimulationState } from '../types'
import { POLICIES } from '../data/policies'
import { getEnding } from './simulation'

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

const STORAGE_KEY = 'gaia-2126-leaderboard-v1'
const API_URL = import.meta.env.VITE_LEADERBOARD_API_URL?.replace(/\/$/, '')

const sampleEntries: LeaderboardEntry[] = [
  { id: 'seed-1', callsign: 'BLUE DOT', score: 1084, endYear: 2126, grade: 'S', temperature: 1.76, nature: 81, trust: 69, resilience: 78, strategy: ['야생 회랑', '행성 전력망'], submittedAt: '2026-08-09T09:00:00.000Z', verified: true },
  { id: 'seed-2', callsign: 'MANGROVE', score: 1017, endYear: 2126, grade: 'S', temperature: 1.84, nature: 88, trust: 61, resilience: 73, strategy: ['스펀지 도시', '살아있는 농장'], submittedAt: '2026-08-09T10:00:00.000Z', verified: true },
  { id: 'seed-3', callsign: 'ORBITAL 7', score: 938, endYear: 2126, grade: 'A', temperature: 2.02, nature: 64, trust: 72, resilience: 84, strategy: ['이주 도시 협약', '태양 도시'], submittedAt: '2026-08-09T11:00:00.000Z', verified: true },
  { id: 'seed-4', callsign: 'HAN RIVER', score: 826, endYear: 2111, grade: 'B', temperature: 2.47, nature: 49, trust: 0, resilience: 67, strategy: ['차세대 원자력', '순환 담수화'], submittedAt: '2026-08-09T12:00:00.000Z', verified: true },
]

function readLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(isEntry) : []
  } catch {
    return []
  }
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<LeaderboardEntry>
  return typeof entry.id === 'string' && typeof entry.callsign === 'string' && Number.isFinite(entry.score)
}

function rank(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => b.endYear - a.endYear || b.score - a.score || a.temperature - b.temperature).slice(0, 50)
}

export function leaderboardMode() {
  return API_URL ? 'NETWORK' : 'LOCAL DEMO'
}

export function createLeaderboardEntry(state: SimulationState, callsign: string): LeaderboardEntry {
  const ending = getEnding(state)
  const strategy = Object.entries(state.policyLevels)
    .sort(([, levelA], [, levelB]) => levelB - levelA)
    .slice(0, 3)
    .map(([id]) => POLICIES.find((policy) => policy.id === id)?.shortName ?? id)
  return {
    id: crypto.randomUUID(),
    callsign: callsign.trim().slice(0, 18) || 'ANONYMOUS',
    score: ending.score,
    endYear: state.year,
    grade: ending.grade,
    temperature: Number(state.temperature.toFixed(2)),
    nature: Math.round(state.nature),
    trust: Math.round(state.trust),
    resilience: Math.round(state.resilience),
    strategy,
    submittedAt: new Date().toISOString(),
    verified: false,
  }
}

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  if (API_URL) {
    try {
      const response = await fetch(`${API_URL}/leaderboard`, { signal: AbortSignal.timeout(4_000) })
      if (response.ok) {
        const entries: unknown = await response.json()
        if (Array.isArray(entries)) return rank(entries.filter(isEntry))
      }
    } catch {
      // The playable build keeps a local board when the competition API is offline.
    }
  }
  return rank([...sampleEntries, ...readLocal()])
}

export async function submitScore(entry: LeaderboardEntry, state: SimulationState): Promise<LeaderboardEntry> {
  if (API_URL) {
    try {
      const response = await fetch(`${API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entry,
          proof: {
            simulationVersion: state.simulationVersion,
            seed: state.seed,
            actions: state.actionLog,
          },
        }),
        signal: AbortSignal.timeout(5_000),
      })
      if (response.ok) {
        const saved: unknown = await response.json()
        if (isEntry(saved)) return saved
      }
    } catch {
      // Fall through so a judge never loses a completed run.
    }
  }
  const localEntry = { ...entry, verified: false }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rank([localEntry, ...readLocal()]).slice(0, 20)))
  } catch {
    // Private browsing and storage quotas must not block the end-of-run screen.
  }
  return localEntry
}
