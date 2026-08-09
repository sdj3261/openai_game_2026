import type { MigrationSummary, SimulationState, WorldSnapshot } from '../types'
import { SIMULATION_VERSION } from './simulation'

export const SAVE_VERSION = 2 as const

export interface SavePayload {
  version: typeof SAVE_VERSION
  savedAt: string
  global: SimulationState
  world: WorldSnapshot
}

export type WorkerRequest =
  | { type: 'INIT'; save?: SavePayload }
  | { type: 'STEP'; policyIds: string[]; eventChoiceId: string }
  | { type: 'RESET' }

export type WorkerResponse =
  | { type: 'READY'; global: SimulationState; world: WorldSnapshot; migration: MigrationSummary }
  | { type: 'STATE'; global: SimulationState; world: WorldSnapshot; migration: MigrationSummary }
  | { type: 'ERROR'; message: string }

const WORLD_FLOAT_FIELDS = [
  'latitude', 'longitude', 'temperature', 'population', 'cohortYoung', 'cohortWorking',
  'cohortSenior', 'food', 'water', 'economy', 'housingCost', 'habitability', 'migrationPressure',
] as const

const WORLD_BYTE_FIELDS = ['land', 'biome', 'cityState', 'disaster', 'countryIndex'] as const

/** Reject stale/corrupt IndexedDB records before they can poison the worker. */
export function isSavePayload(value: unknown, expectedCellCount = 5000): value is SavePayload {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SavePayload>
  const global = candidate.global as Partial<SimulationState> | undefined
  const world = candidate.world as Partial<WorldSnapshot> | undefined
  if (!global || !world) return false

  const finiteGlobalFields = [
    global.temperature,
    global.emissions,
    global.funds,
    global.nature,
    global.trust,
    global.economy,
    global.resilience,
    global.cleanEnergy,
  ]

  if (
    candidate.version !== SAVE_VERSION
    || typeof candidate.savedAt !== 'string'
    || !Number.isInteger(global.year)
    || !Number.isInteger(global.turn)
    || global.simulationVersion !== SIMULATION_VERSION
    || !Number.isSafeInteger(global.seed)
    || !Array.isArray(global.actionLog)
    || global.actionLog.length !== global.turn
    || !global.actionLog.every((action) => Number.isInteger(action?.turn)
      && Number.isInteger(action?.year)
      && Array.isArray(action?.policyIds)
      && action.policyIds.every((id) => typeof id === 'string')
      && typeof action?.eventChoiceId === 'string')
    || !finiteGlobalFields.every(Number.isFinite)
    || !global.policyLevels
    || typeof global.policyLevels !== 'object'
    || Array.isArray(global.policyLevels)
    || !Object.values(global.policyLevels).every((level) => Number.isInteger(level) && level >= 0)
    || !Array.isArray(global.history)
    || !global.history.every((point) => Number.isFinite(point?.year)
      && Number.isFinite(point?.temperature)
      && Number.isFinite(point?.emissions)
      && Number.isFinite(point?.nature)
      && Number.isFinite(point?.trust))
    || typeof global.lastReport !== 'string'
    || typeof global.gameOver !== 'boolean'
    || world.cellCount !== expectedCellCount
  ) return false

  for (const field of WORLD_FLOAT_FIELDS) {
    const array = world[field]
    if (
      !(array instanceof Float32Array)
      || !(array.buffer instanceof ArrayBuffer)
      || array.length !== expectedCellCount
    ) return false
    for (const entry of array) if (!Number.isFinite(entry)) return false
  }
  for (const field of WORLD_BYTE_FIELDS) {
    const array = world[field]
    if (
      !(array instanceof Uint8Array)
      || !(array.buffer instanceof ArrayBuffer)
      || array.length !== expectedCellCount
    ) return false
  }
  return true
}
