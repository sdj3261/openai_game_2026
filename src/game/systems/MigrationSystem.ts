import type { MigrationSummary, WorldSnapshot } from '../../types'
import { angularDistance } from './worldMath'

export const MIGRATION_ROUTE_STRIDE = 5

function destinationQuality(world: WorldSnapshot, index: number) {
  return world.habitability[index] * 0.44
    + world.water[index] / 100 * 0.16
    + world.food[index] / 100 * 0.12
    + world.economy[index] / 100 * 0.2
    + (1 - world.housingCost[index] / 180) * 0.08
}

export class MigrationSystem {
  advance(previous: WorldSnapshot, next: WorldSnapshot): MigrationSummary {
    const nextYoung = new Float32Array(previous.cohortYoung)
    const nextWorking = new Float32Array(previous.cohortWorking)
    const nextSenior = new Float32Array(previous.cohortSenior)

    // ponytail: At 5k cells this bounded CPU neighbor heuristic is simpler; reconsider WebGPU above 20k cells.
    const destinationCandidates = Array.from({ length: next.cellCount }, (_, index) => index)
      .filter((index) => next.land[index] && next.habitability[index] > 0.48 && next.population[index] > 0.15)
      .sort((a, b) => destinationQuality(next, b) - destinationQuality(next, a))
      .slice(0, 72)

    const routes: { from: number; to: number; people: number }[] = []
    let displacedMillions = 0
    for (let index = 0; index < next.cellCount; index += 1) {
      const pressure = next.migrationPressure[index]
      if (!next.land[index] || next.population[index] < 0.1 || pressure < 0.12) continue

      const sourceQuality = destinationQuality(next, index)
      let destination = -1
      let bestScore = sourceQuality
      for (const candidate of destinationCandidates) {
        if (candidate === index) continue
        const distance = angularDistance(
          next.latitude[index], next.longitude[index], next.latitude[candidate], next.longitude[candidate],
        )
        const sameRegion = next.countryIndex[index] === next.countryIndex[candidate] ? 0.035 : 0
        const score = destinationQuality(next, candidate) + sameRegion - distance / Math.PI * 0.09
        if (score > bestScore + 0.025) {
          destination = candidate
          bestScore = score
        }
      }
      if (destination < 0) continue

      const movedYoung = previous.cohortYoung[index] * Math.min(0.2, pressure * 0.19)
      const movedWorking = previous.cohortWorking[index] * Math.min(0.17, pressure * 0.16)
      const movedSenior = previous.cohortSenior[index] * Math.min(0.07, pressure * 0.065)
      const moved = movedYoung + movedWorking + movedSenior
      if (moved <= 0) continue

      nextYoung[index] -= movedYoung
      nextYoung[destination] += movedYoung
      nextWorking[index] -= movedWorking
      nextWorking[destination] += movedWorking
      nextSenior[index] -= movedSenior
      nextSenior[destination] += movedSenior
      displacedMillions += moved
      if (moved >= 0.025) routes.push({ from: index, to: destination, people: moved })
    }

    for (let index = 0; index < next.cellCount; index += 1) {
      if (!next.land[index]) continue
      next.cohortYoung[index] = Math.max(0, nextYoung[index])
      next.cohortWorking[index] = Math.max(0, nextWorking[index])
      next.cohortSenior[index] = Math.max(0, nextSenior[index])
      next.population[index] = next.cohortYoung[index] + next.cohortWorking[index] + next.cohortSenior[index]
    }

    routes.sort((a, b) => b.people - a.people)
    const representativeRoutes = routes.slice(0, 12)
    const packedRoutes = new Float32Array(representativeRoutes.length * MIGRATION_ROUTE_STRIDE)
    representativeRoutes.forEach((route, routeIndex) => {
      const offset = routeIndex * MIGRATION_ROUTE_STRIDE
      packedRoutes[offset] = next.latitude[route.from]
      packedRoutes[offset + 1] = next.longitude[route.from]
      packedRoutes[offset + 2] = next.latitude[route.to]
      packedRoutes[offset + 3] = next.longitude[route.to]
      packedRoutes[offset + 4] = route.people
    })

    return { routes: packedRoutes, displacedMillions, collapsedCities: 0, growingCities: 0 }
  }
}
