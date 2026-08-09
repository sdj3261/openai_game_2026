import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '../data/countries'
import {
  advanceSimulation,
  advanceWorld,
  BASELINE_WARMING_C,
  createWorld,
  EarthSimulation,
  INITIAL_STATE,
  MIGRATION_ROUTE_STRIDE,
  projectCountry,
  WORLD_CELL_COUNT,
} from './simulation'
import { isSavePayload, SAVE_VERSION } from './workerProtocol'

function sum(values: Float32Array) {
  let total = 0
  for (const value of values) total += value
  return total
}

function landAverage(values: Float32Array, land: Uint8Array) {
  let total = 0
  let count = 0
  for (let index = 0; index < values.length; index += 1) {
    if (!land[index]) continue
    total += values[index]
    count += 1
  }
  return total / count
}

describe('planetary simulation', () => {
  it('advances five years and records the result', () => {
    const next = advanceSimulation(INITIAL_STATE, ['solar-cities'], 'binding')
    expect(next.year).toBe(2031)
    expect(next.history).toHaveLength(2)
    expect(next.emissions).toBeLessThan(INITIAL_STATE.emissions)
    expect(next.actionLog).toEqual([
      { turn: 0, year: 2026, policyIds: ['solar-cities'], eventChoiceId: 'binding' },
    ])
  })

  it('orchestrates deterministic systems while keeping authoritative arrays private', () => {
    const first = new EarthSimulation()
    const second = new EarthSimulation()

    const firstMigration = first.step(['solar-cities'], 'binding')
    const secondMigration = second.step(['solar-cities'], 'binding')
    const firstSnapshot = first.snapshot()
    const secondSnapshot = second.snapshot()

    expect(firstSnapshot.global).toEqual(secondSnapshot.global)
    expect(firstSnapshot.world.disaster).toEqual(secondSnapshot.world.disaster)
    expect(firstMigration.routes).toEqual(secondMigration.routes)

    firstSnapshot.world.water[0] = -999
    expect(first.snapshot().world.water[0]).not.toBe(-999)
  })

  it('restores cloned state and typed-array world data', () => {
    const source = new EarthSimulation()
    source.step(['solar-cities'], 'binding')
    const saved = source.snapshot()
    const restored = new EarthSimulation()
    restored.restore(saved.global, saved.world)

    saved.global.actionLog[0].policyIds.push('coal-exit')
    saved.world.food[0] = -999
    const snapshot = restored.snapshot()
    expect(snapshot.global.actionLog[0].policyIds).toEqual(['solar-cities'])
    expect(snapshot.world.food[0]).not.toBe(-999)
  })

  it('rewards combined mitigation with a cooler 2126', () => {
    let actionState = INITIAL_STATE
    let idleState = INITIAL_STATE

    for (let turn = 0; turn < 20; turn += 1) {
      const eventChoice = turn % 8 === 0 ? 'binding' : ['cooling', 'open', 'restore', 'corridor', 'guardrails', 'dividend', 'residual'][Math.max(0, (turn % 8) - 1)]
      actionState = advanceSimulation(actionState, turn < 3 ? ['planetary-grid', 'coal-exit'] : [], eventChoice)
      idleState = advanceSimulation(idleState, [], eventChoice)
    }

    expect(actionState.temperature).toBeLessThan(idleState.temperature)
  })

  it('country risk responds to global resilience', () => {
    const country = COUNTRIES.find((item) => item.id === 'IDN')!
    const lowResilience = projectCountry(country, { ...INITIAL_STATE, year: 2076, temperature: 2.2, resilience: 10 })
    const highResilience = projectCountry(country, { ...INITIAL_STATE, year: 2076, temperature: 2.2, resilience: 80 })
    expect(highResilience.risk).toBeLessThan(lowResilience.risk)
  })

  it('starts from the observed 2023–2025 warming baseline', () => {
    expect(INITIAL_STATE.temperature).toBe(BASELINE_WARMING_C)
    expect(INITIAL_STATE.lastReport).toContain('+1.48°C')
  })

  it('deduplicates policies and never spends funds the player does not have', () => {
    const duplicate = advanceSimulation(INITIAL_STATE, ['solar-cities', 'solar-cities'], 'binding')
    expect(duplicate.policyLevels['solar-cities']).toBe(1)

    const broke = advanceSimulation({ ...INITIAL_STATE, funds: 1 }, ['solar-cities'], 'binding')
    expect(broke.policyLevels['solar-cities']).toBeUndefined()
    expect(broke.funds).toBeGreaterThanOrEqual(0)
  })

  it('does not advance on a stale event choice', () => {
    expect(advanceSimulation(INITIAL_STATE, ['solar-cities'], 'not-this-turn')).toBe(INITIAL_STATE)
  })

  it('creates 5,000 typed cells with population cohorts that reconcile', () => {
    const world = createWorld()
    expect(world.cellCount).toBe(WORLD_CELL_COUNT)
    expect(world.population).toBeInstanceOf(Float32Array)
    expect(world.cityState).toBeInstanceOf(Uint8Array)
    expect(sum(world.population)).toBeCloseTo(8200, 0)

    for (let index = 0; index < world.cellCount; index += 1) {
      expect(world.cohortYoung[index] + world.cohortWorking[index] + world.cohortSenior[index])
        .toBeCloseTo(world.population[index], 4)
    }
  })

  it('propagates extreme warming through water and food into migration pressure', () => {
    const baselineWorld = createWorld()
    const calm = advanceWorld(
      baselineWorld,
      INITIAL_STATE,
      { ...INITIAL_STATE, turn: 1, year: 2031 },
    ).world
    const hot = advanceWorld(
      baselineWorld,
      INITIAL_STATE,
      { ...INITIAL_STATE, turn: 1, year: 2031, temperature: 3.2, resilience: 12, nature: 35 },
    ).world

    expect(landAverage(hot.water, hot.land)).toBeLessThan(landAverage(calm.water, calm.land))
    expect(landAverage(hot.food, hot.land)).toBeLessThan(landAverage(calm.food, calm.land))
    expect(landAverage(hot.migrationPressure, hot.land))
      .toBeGreaterThan(landAverage(calm.migrationPressure, calm.land))
  })

  it('produces visible representative migration on a plausible opening turn', () => {
    const initialWorld = createWorld()
    const nextGlobal = advanceSimulation(INITIAL_STATE, ['solar-cities'], 'binding')
    const { migration } = advanceWorld(initialWorld, INITIAL_STATE, nextGlobal)

    expect(migration.displacedMillions).toBeGreaterThan(0)
    expect(migration.routes.length).toBeGreaterThan(0)
  })

  it('moves cohorts without losing people and packs only representative routes', () => {
    const initialWorld = createWorld()
    const before = sum(initialWorld.population)
    const { world, migration } = advanceWorld(
      initialWorld,
      INITIAL_STATE,
      { ...INITIAL_STATE, turn: 8, year: 2066, temperature: 3.8, resilience: 8, nature: 28, economy: 42 },
    )

    expect(sum(world.population)).toBeCloseTo(before, 2)
    expect(migration.displacedMillions).toBeGreaterThan(0)
    expect(migration.routes.length % MIGRATION_ROUTE_STRIDE).toBe(0)
    expect(migration.routes.length / MIGRATION_ROUTE_STRIDE).toBeLessThanOrEqual(12)
    for (let index = 0; index < world.cellCount; index += 1) {
      expect(world.cohortYoung[index] + world.cohortWorking[index] + world.cohortSenior[index])
        .toBeCloseTo(world.population[index], 4)
    }
  })

  it('turns visible cities into collapse and growth states after a severe migration shock', () => {
    const initialWorld = createWorld()
    const landCells = Array.from({ length: initialWorld.cellCount }, (_, index) => index)
      .filter((index) => initialWorld.land[index])
    const source = landCells[0]
    const destination = landCells[landCells.length - 1]

    initialWorld.population[source] = 20
    initialWorld.cohortYoung[source] = 5
    initialWorld.cohortWorking[source] = 12
    initialWorld.cohortSenior[source] = 3
    initialWorld.cityState[source] = 2
    initialWorld.temperature[source] = 48
    initialWorld.water[source] = 2
    initialWorld.food[source] = 2
    initialWorld.economy[source] = 2
    initialWorld.housingCost[source] = 178

    initialWorld.population[destination] = 10
    initialWorld.cohortYoung[destination] = 2.5
    initialWorld.cohortWorking[destination] = 6
    initialWorld.cohortSenior[destination] = 1.5
    initialWorld.cityState[destination] = 2
    initialWorld.temperature[destination] = 18
    initialWorld.water[destination] = 100
    initialWorld.food[destination] = 100
    initialWorld.economy[destination] = 100
    initialWorld.housingCost[destination] = 8

    const { world, migration } = advanceWorld(
      initialWorld,
      INITIAL_STATE,
      { ...INITIAL_STATE, turn: 9, year: 2071, temperature: 4.2, resilience: 0, nature: 20, economy: 35 },
    )

    expect(world.cityState[source]).toBe(4)
    expect(world.cityState[destination]).toBe(1)
    expect(migration.collapsedCities).toBeGreaterThan(0)
    expect(migration.growingCities).toBeGreaterThan(0)
  })

  it('rejects malformed autosaves before worker restore', () => {
    const world = createWorld()
    const valid = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      global: INITIAL_STATE,
      world,
    }
    expect(isSavePayload(valid)).toBe(true)
    expect(isSavePayload({ ...valid, world: { ...world, water: new Float32Array(4) } })).toBe(false)
    expect(isSavePayload({ ...valid, global: { ...INITIAL_STATE, actionLog: undefined } })).toBe(false)
  })
})
