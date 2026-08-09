import type { SimulationState, WorldSnapshot } from '../../types'
import { clamp, seeded } from './worldMath'

export class ClimateSystem {
  advance(world: WorldSnapshot, previousGlobal: SimulationState, nextGlobal: SimulationState) {
    const globalTemperatureDelta = nextGlobal.temperature - previousGlobal.temperature
    const globalHeatStress = Math.max(0, nextGlobal.temperature - 1.5)
    const resilience = nextGlobal.resilience / 100

    for (let index = 0; index < world.cellCount; index += 1) {
      if (!world.land[index]) continue

      const polarAmplification = 1 + Math.abs(world.latitude[index]) / 90 * 0.75
      world.temperature[index] += globalTemperatureDelta * polarAmplification
      const randomShock = seeded(index + 101, nextGlobal.turn, nextGlobal.seed)
      const dryBiome = world.biome[index] === 3
      const floodProne = Math.abs(world.latitude[index]) < 45 && Math.abs(world.longitude[index]) % 7 < 2.2
      const hazardChance = clamp(
        0.008 + globalHeatStress * 0.065 + Math.max(0, 45 - world.water[index]) * 0.0012 - resilience * 0.025,
        0.004,
        0.28,
      )

      let disaster = 0
      if (randomShock < hazardChance) {
        if (dryBiome && world.water[index] < 48) disaster = 3
        else if (floodProne && seeded(index + 211, nextGlobal.turn, nextGlobal.seed) > 0.5) disaster = 2
        else if (world.temperature[index] > 27) disaster = 1
        else disaster = 4
      }
      world.disaster[index] = disaster
    }
  }
}
