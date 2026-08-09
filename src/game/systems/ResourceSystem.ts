import type { SimulationState, WorldSnapshot } from '../../types'
import { clamp } from './worldMath'

export class ResourceSystem {
  advance(world: WorldSnapshot, nextGlobal: SimulationState) {
    const globalHeatStress = Math.max(0, nextGlobal.temperature - 1.5)
    const resilience = nextGlobal.resilience / 100
    const nature = nextGlobal.nature / 100

    for (let index = 0; index < world.cellCount; index += 1) {
      if (!world.land[index]) continue

      const localHeat = Math.max(0, world.temperature[index] - 27)
      const dryBiome = world.biome[index] === 3
      const disaster = world.disaster[index]
      const droughtLoss = globalHeatStress * 0.42 + localHeat * 0.065 + (dryBiome ? 0.34 : 0)
      const waterProtection = resilience * 0.34 + nature * 0.12
      const disasterWater = disaster === 2 ? 1.4 : disaster === 3 ? -1.1 : disaster === 1 ? -0.55 : 0
      world.water[index] = clamp(world.water[index] - droughtLoss + waterProtection + disasterWater, 2, 100)

      const waterSupport = (world.water[index] - 54) * 0.021
      const ecosystemSupport = (nature - 0.5) * 0.34
      const cropHeatLoss = globalHeatStress * 0.34 + Math.max(0, world.temperature[index] - 29) * 0.09
      const disasterFoodLoss = disaster === 0 ? 0 : disaster === 2 ? 1.8 : 2.6
      world.food[index] = clamp(world.food[index] + waterSupport + ecosystemSupport - cropHeatLoss - disasterFoodLoss, 1, 100)

      const foodShortage = Math.max(0, 48 - world.food[index]) / 48
      const waterShortage = Math.max(0, 45 - world.water[index]) / 45
      const localEconomicTrend = (nextGlobal.economy - 55) * 0.012
      const disruption = foodShortage * 0.9 + waterShortage * 0.75 + (disaster ? 1.45 : 0)
      world.economy[index] = clamp(world.economy[index] + localEconomicTrend - disruption + resilience * 0.16, 1, 100)

      const crowding = Math.log1p(world.population[index]) * 0.08
      const disasterHousingLoss = disaster ? 1.65 : 0
      world.housingCost[index] = clamp(
        world.housingCost[index] + crowding + disasterHousingLoss - resilience * 0.36,
        8,
        180,
      )

      const thermalComfort = 1 - clamp(Math.abs(world.temperature[index] - 18) / 28, 0, 1)
      const habitability = thermalComfort * 0.2
        + world.water[index] / 100 * 0.24
        + world.food[index] / 100 * 0.2
        + world.economy[index] / 100 * 0.16
        + resilience * 0.12
        + (1 - world.housingCost[index] / 180) * 0.08
        - (disaster ? 0.1 : 0)
      world.habitability[index] = clamp(habitability, 0.02, 0.98)

      const housingBurden = clamp((world.housingCost[index] - 70) / 110, 0, 1)
      const economicStress = clamp((48 - world.economy[index]) / 48, 0, 1)
      const heatBurden = clamp((world.temperature[index] - 29) / 13, 0, 1)
      world.migrationPressure[index] = clamp(
        waterShortage * 0.28
          + foodShortage * 0.25
          + housingBurden * 0.13
          + economicStress * 0.14
          + heatBurden * 0.12
          + (disaster ? 0.16 : 0)
          + Math.max(0, 0.5 - world.habitability[index]) * 0.55
          - resilience * 0.07,
        0,
        1,
      )
    }
  }
}
