export type PolicyFocus = 'mitigation' | 'adaptation' | 'nature' | 'justice'

export type IconName =
  | 'sun'
  | 'grid'
  | 'factory'
  | 'leaf'
  | 'train'
  | 'farm'
  | 'waves'
  | 'people'
  | 'globe'
  | 'search'
  | 'thermometer'
  | 'cloud'
  | 'shield'
  | 'coins'
  | 'spark'
  | 'arrow'
  | 'reset'
  | 'sound'
  | 'mute'
  | 'info'
  | 'check'

export interface Effects {
  emissions?: number
  nature?: number
  trust?: number
  economy?: number
  resilience?: number
  funds?: number
  cleanEnergy?: number
}

export interface Policy {
  id: string
  name: string
  shortName: string
  description: string
  cost: number
  focus: PolicyFocus
  icon: IconName
  accent: string
  effects: Effects
  maxLevel: number
}

export interface EventChoice {
  id: string
  label: string
  consequence: string
  effects: Effects
}

export interface WorldEvent {
  id: string
  eyebrow: string
  title: string
  description: string
  choices: [EventChoice, EventChoice]
}

export interface HistoryPoint {
  year: number
  temperature: number
  emissions: number
  nature: number
  trust: number
}

export interface SimulationState {
  year: number
  turn: number
  simulationVersion: number
  seed: number
  actionLog: {
    turn: number
    year: number
    policyIds: string[]
    eventChoiceId: string
  }[]
  temperature: number
  emissions: number
  funds: number
  nature: number
  trust: number
  economy: number
  resilience: number
  cleanEnergy: number
  policyLevels: Record<string, number>
  history: HistoryPoint[]
  lastReport: string
  gameOver: boolean
}

export type Biome = 'temperate' | 'tropical' | 'arid' | 'coastal' | 'arctic'

export interface CountryProfile {
  id: string
  nameKo: string
  nameEn: string
  flag: string
  lat: number
  lon: number
  biome: Biome
  vulnerability: number
  baseHeatDays: number
  coastalExposure: number
  population2026: number
  signatureRisk: string
  opportunity: string
}

export interface CountryProjection {
  risk: number
  heatDays: number
  seaLevelCm: number
  waterSecurity: number
  status: string
  narrative: string
}

export interface WorldSnapshot {
  cellCount: number
  latitude: Float32Array
  longitude: Float32Array
  land: Uint8Array
  biome: Uint8Array
  temperature: Float32Array
  population: Float32Array
  cohortYoung: Float32Array
  cohortWorking: Float32Array
  cohortSenior: Float32Array
  food: Float32Array
  water: Float32Array
  economy: Float32Array
  housingCost: Float32Array
  habitability: Float32Array
  migrationPressure: Float32Array
  cityState: Uint8Array
  disaster: Uint8Array
  countryIndex: Uint8Array
}

export interface MigrationSummary {
  routes: Float32Array
  displacedMillions: number
  collapsedCities: number
  growingCities: number
}
