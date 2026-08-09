/// <reference lib="webworker" />

import type { MigrationSummary } from '../types'
import { EarthSimulation, WORLD_CELL_COUNT, worldTransferables } from './simulation'
import { isSavePayload, type WorkerRequest, type WorkerResponse } from './workerProtocol'

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope
const EMPTY_MIGRATION = (): MigrationSummary => ({
  routes: new Float32Array(),
  displacedMillions: 0,
  collapsedCities: 0,
  growingCities: 0,
})

const simulation = new EarthSimulation()

function emit(type: 'READY' | 'STATE', migration: MigrationSummary) {
  // EarthSimulation keeps the authoritative arrays; only this render snapshot is detached.
  const snapshot = simulation.snapshot()
  const response: WorkerResponse = {
    type,
    global: snapshot.global,
    world: snapshot.world,
    migration,
  }
  workerScope.postMessage(response, [...worldTransferables(snapshot.world), migration.routes.buffer as ArrayBuffer])
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    switch (event.data.type) {
      case 'INIT': {
        if (isSavePayload(event.data.save, WORLD_CELL_COUNT)) simulation.restore(event.data.save.global, event.data.save.world)
        else simulation.reset()
        emit('READY', EMPTY_MIGRATION())
        return
      }
      case 'RESET': {
        simulation.reset()
        emit('READY', EMPTY_MIGRATION())
        return
      }
      case 'STEP': {
        emit('STATE', simulation.step(event.data.policyIds, event.data.eventChoiceId))
        return
      }
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'ERROR',
      message: error instanceof Error ? error.message : 'Simulation worker failed.',
    }
    workerScope.postMessage(response)
  }
}

export {}
