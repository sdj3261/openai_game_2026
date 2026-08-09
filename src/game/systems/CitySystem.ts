import type { WorldSnapshot } from '../../types'
import { clamp } from './worldMath'

export class CitySystem {
  advance(previous: WorldSnapshot, next: WorldSnapshot) {
    let collapsedCities = 0
    let growingCities = 0

    for (let index = 0; index < next.cellCount; index += 1) {
      if (!next.land[index]) continue

      const oldPopulation = previous.population[index]
      const change = oldPopulation > 0 ? (next.population[index] - oldPopulation) / oldPopulation : 0
      next.housingCost[index] = clamp(next.housingCost[index] + change * 24, 8, 180)
      const wasCity = previous.cityState[index] > 0 || oldPopulation >= 8
      const isCity = wasCity || next.population[index] >= 8

      if (!isCity) next.cityState[index] = 0
      else if (next.habitability[index] < 0.23 || (next.migrationPressure[index] > 0.78 && change < -0.055)) {
        next.cityState[index] = 4
        collapsedCities += 1
      } else if (next.migrationPressure[index] > 0.42 || next.habitability[index] < 0.46) {
        next.cityState[index] = 3
      } else if (change > 0.012) {
        next.cityState[index] = 1
        growingCities += 1
      } else next.cityState[index] = 2
    }

    return { collapsedCities, growingCities }
  }
}
