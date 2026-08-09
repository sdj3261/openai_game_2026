import { create } from 'zustand'
import { COUNTRIES } from '../data/countries'
import { POLICIES } from '../data/policies'
import type { MigrationSummary, SimulationState, WorldSnapshot } from '../types'
import { getEventForTurn, INITIAL_STATE } from './simulation'
import { clearSave, loadGame, saveGame } from './save'
import { SAVE_VERSION, type WorkerRequest, type WorkerResponse } from './workerProtocol'

interface GameStore {
  global: SimulationState
  world?: WorldSnapshot
  migration: MigrationSummary
  ready: boolean
  busy: boolean
  started: boolean
  selectedPolicies: string[]
  eventChoiceId?: string
  selectedCountryId: string
  audioEnabled: boolean
  engineLabel: string
  error?: string
  initialize: () => Promise<void>
  start: () => void
  togglePolicy: (id: string) => void
  chooseEvent: (id: string) => void
  selectCountry: (id: string) => void
  toggleAudio: () => void
  setEngineLabel: (label: string) => void
  advance: () => void
  reset: () => Promise<void>
}

let simulationWorker: Worker | undefined
let initializing = false

const emptyMigration: MigrationSummary = {
  routes: new Float32Array(),
  displacedMillions: 0,
  collapsedCities: 0,
  growingCities: 0,
}

function post(message: WorkerRequest): boolean {
  if (!simulationWorker) return false
  simulationWorker.postMessage(message)
  return true
}

export const useGameStore = create<GameStore>((set, get) => ({
  global: structuredClone(INITIAL_STATE),
  migration: emptyMigration,
  ready: false,
  busy: false,
  started: false,
  selectedPolicies: [],
  selectedCountryId: COUNTRIES[0].id,
  audioEnabled: true,
  engineLabel: 'ENGINE STARTING',

  initialize: async () => {
    if (initializing || simulationWorker) return
    initializing = true
    set({ error: undefined })
    try {
      const saved = await loadGame()
      const worker = new Worker(new URL('./earth.worker.ts', import.meta.url), { type: 'module' })
      simulationWorker = worker
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (simulationWorker !== worker) return
        const response = event.data
        if (response.type === 'ERROR') {
          set({ error: response.message, busy: false })
          return
        }
        set({
          global: response.global,
          world: response.world,
          migration: response.migration,
          ready: true,
          busy: false,
          error: undefined,
          selectedPolicies: [],
          eventChoiceId: undefined,
        })
        void saveGame({
          version: SAVE_VERSION,
          savedAt: new Date().toISOString(),
          global: response.global,
          world: response.world,
        })
      }
      worker.onerror = () => {
        if (simulationWorker !== worker) return
        worker.terminate()
        simulationWorker = undefined
        set({ error: '행성 시뮬레이션 워커를 시작하지 못했습니다.', ready: false, busy: false })
      }
      worker.postMessage({ type: 'INIT', save: saved } satisfies WorkerRequest)
    } catch {
      simulationWorker?.terminate()
      simulationWorker = undefined
      set({ error: '행성 시뮬레이션을 초기화하지 못했습니다.', ready: false, busy: false })
    } finally {
      initializing = false
    }
  },
  start: () => set({ started: true }),
  togglePolicy: (id) => set((state) => {
    if (state.busy || state.global.gameOver) return state
    const policy = POLICIES.find((candidate) => candidate.id === id)
    if (!policy || (!state.selectedPolicies.includes(id) && (state.global.policyLevels[id] ?? 0) >= policy.maxLevel)) {
      return state
    }
    const selected = state.selectedPolicies.includes(id)
      ? state.selectedPolicies.filter((item) => item !== id)
      : state.selectedPolicies.length < 2 ? [...state.selectedPolicies, id] : state.selectedPolicies
    const cost = selected.reduce((sum, policyId) => sum + (POLICIES.find((policy) => policy.id === policyId)?.cost ?? 0), 0)
    return cost <= state.global.funds ? { selectedPolicies: selected } : state
  }),
  chooseEvent: (id) => set((state) => {
    if (state.busy || state.global.gameOver) return state
    const valid = getEventForTurn(state.global.turn).choices.some((choice) => choice.id === id)
    return valid ? { eventChoiceId: id } : state
  }),
  selectCountry: (id) => {
    if (COUNTRIES.some((country) => country.id === id)) set({ selectedCountryId: id })
  },
  toggleAudio: () => set((state) => ({ audioEnabled: !state.audioEnabled })),
  setEngineLabel: (engineLabel) => set({ engineLabel }),
  advance: () => {
    const state = get()
    if (!state.ready || state.busy || !state.eventChoiceId || state.selectedPolicies.length === 0 || state.global.gameOver) return
    set({ busy: true })
    if (!post({ type: 'STEP', policyIds: state.selectedPolicies, eventChoiceId: state.eventChoiceId })) {
      set({ busy: false, ready: false, error: '시뮬레이션 워커 연결이 끊어졌습니다. 다시 시작해 주세요.' })
    }
  },
  reset: async () => {
    await clearSave()
    set({ busy: true, started: true, error: undefined, selectedPolicies: [], eventChoiceId: undefined })
    if (!post({ type: 'RESET' })) {
      set({
        global: structuredClone(INITIAL_STATE),
        world: undefined,
        migration: emptyMigration,
        ready: false,
        busy: false,
      })
      await get().initialize()
    }
  },
}))
