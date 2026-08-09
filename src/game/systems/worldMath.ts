export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function degrees(value: number) {
  return value * Math.PI / 180
}

function wrappedLongitudeDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 360
  return Math.min(distance, 360 - distance)
}

export function angularDistance(latA: number, lonA: number, latB: number, lonB: number) {
  const p1 = degrees(latA)
  const p2 = degrees(latB)
  const delta = degrees(wrappedLongitudeDistance(lonA, lonB))
  const cosine = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(delta)
  return Math.acos(clamp(cosine, -1, 1))
}

export function seeded(index: number, turn = 0, seed = 0) {
  const raw = Math.sin(index * 12.9898 + turn * 78.233 + seed * 0.017) * 43758.5453
  return raw - Math.floor(raw)
}
