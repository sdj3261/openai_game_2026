import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Scene } from '@babylonjs/core/scene'
import '@babylonjs/core/Shaders/default.fragment'
import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/ShadersWGSL/default.fragment'
import '@babylonjs/core/ShadersWGSL/default.vertex'
import { useEffect, useRef } from 'react'
import type { CountryProfile, MigrationSummary, WorldSnapshot } from '../types'

interface Props {
  temperature: number
  cleanEnergy: number
  country: CountryProfile
  world?: WorldSnapshot
  migration?: MigrationSummary
  paused?: boolean
  onEngineChange?: (label: string) => void
}

type BabylonEngine = Engine | WebGPUEngine
const EARTH_RADIUS = 1.46

interface MigrationVisual {
  line: Mesh
  dots: Mesh[]
  points: Vector3[]
}

interface SceneController {
  engine: BabylonEngine
  scene: Scene
  root: TransformNode
  tiles: Mesh
  cities: Mesh
  marker: TransformNode
  migration: MigrationVisual[]
  world?: WorldSnapshot
}

async function createEngine(canvas: HTMLCanvasElement): Promise<{ engine: BabylonEngine; label: string }> {
  const forceWebGl = new URLSearchParams(window.location.search).get('renderer') === 'webgl'
  if (!forceWebGl && await WebGPUEngine.IsSupportedAsync) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true })
      await engine.initAsync()
      return { engine, label: 'WEBGPU · 5K CELLS' }
    } catch {
      // Some browsers expose navigator.gpu but fail device initialization.
    }
  }
  return {
    engine: new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance' }),
    label: 'WEBGL2 FALLBACK · 5K CELLS',
  }
}

function latLonToVector(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function normalQuaternion(normal: Vector3) {
  const up = Vector3.Up()
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(up, normal)))
  if (dot > 0.9999) return Quaternion.Identity()
  if (dot < -0.9999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI)
  const axis = Vector3.Cross(up, normal).normalize()
  return Quaternion.RotationAxis(axis, Math.acos(dot))
}

function writeMatrix(target: Float32Array, offset: number, position: Vector3, scale: Vector3, rotation: Quaternion) {
  const matrix = Matrix.Compose(scale, rotation, position)
  matrix.copyToArray(target, offset)
}

function cellColor(world: WorldSnapshot, index: number, globalTemperature: number, cleanEnergy: number) {
  const heat = Math.max(0, Math.min(1, (globalTemperature - 1.35) / 2.35))
  const disaster = world.disaster[index]
  if (disaster) return Color4.FromHexString(disaster === 2 ? '#58c8ffff' : disaster === 3 ? '#ffb347ff' : '#ff5c4dff')

  const scarcity = Math.max(0, 42 - world.water[index]) / 42 * 0.34
    + Math.max(0, 44 - world.food[index]) / 44 * 0.28
  const localStress = Math.max(0, 0.58 - world.habitability[index]) * 0.9
    + world.migrationPressure[index] * 0.34
    + scarcity
  const stress = Math.min(1, heat * 0.3 + localStress)
  const stable = Color3.FromHexString('#4ce0b1')
  const strained = Color3.FromHexString('#ffc45c')
  const critical = Color3.FromHexString('#ff654f')
  const color = stress < 0.62
    ? Color3.Lerp(stable, strained, stress / 0.62)
    : Color3.Lerp(strained, critical, (stress - 0.62) / 0.38)
  if (cleanEnergy > 58 && index % 157 === 0) return new Color4(0.42, 1, 0.82, 0.72)
  return new Color4(color.r, color.g, color.b, 0.14 + stress * 0.42)
}

function updateTiles(controller: SceneController, world: WorldSnapshot, temperature: number, cleanEnergy: number) {
  const matrices = new Float32Array(world.cellCount * 16)
  const colors = new Float32Array(world.cellCount * 4)
  for (let index = 0; index < world.cellCount; index += 1) {
    if (!world.land[index]) {
      writeMatrix(matrices, index * 16, Vector3.Zero(), Vector3.Zero(), Quaternion.Identity())
      continue
    }
    const normal = latLonToVector(world.latitude[index], world.longitude[index], 1).normalize()
    const color = cellColor(world, index, temperature, cleanEnergy)
    const stressed = color.a > 0.42
    const dotWidth = world.disaster[index] ? 0.042 : stressed ? 0.027 : 0.018
    const position = normal.scale(EARTH_RADIUS + 0.005)
    writeMatrix(matrices, index * 16, position, new Vector3(dotWidth, 1, dotWidth), normalQuaternion(normal))
    const colorOffset = index * 4
    colors[colorOffset] = color.r
    colors[colorOffset + 1] = color.g
    colors[colorOffset + 2] = color.b
    colors[colorOffset + 3] = color.a
  }
  controller.tiles.thinInstanceSetBuffer('matrix', matrices, 16, false)
  controller.tiles.thinInstanceSetBuffer('color', colors, 4, false)
  controller.world = world
}

function updateCities(controller: SceneController, world: WorldSnapshot) {
  const cityIndices: number[] = []
  for (let index = 0; index < world.cellCount; index += 1) {
    if (world.cityState[index] > 0 && world.population[index] > 4.5) cityIndices.push(index)
  }
  cityIndices.sort((a, b) => world.population[b] - world.population[a])
  const visible = cityIndices.slice(0, 220)
  const matrices = new Float32Array(visible.length * 16)
  const colors = new Float32Array(visible.length * 4)
  visible.forEach((cellIndex, visualIndex) => {
    const normal = latLonToVector(world.latitude[cellIndex], world.longitude[cellIndex], 1).normalize()
    const status = world.cityState[cellIndex]
    const livingHeight = 0.025 + Math.min(0.065, Math.sqrt(world.population[cellIndex]) * 0.007)
    const height = status === 4 ? 0.012 : status === 1 ? livingHeight * 1.15 : livingHeight
    const width = status === 4 ? 0.024 : 0.012 + Math.min(0.012, Math.sqrt(world.population[cellIndex]) * 0.0015)
    writeMatrix(
      matrices,
      visualIndex * 16,
      normal.scale(EARTH_RADIUS + 0.007 + height * 0.5),
      new Vector3(width, height, width),
      normalQuaternion(normal),
    )
    const color = Color4.FromHexString(status === 1 ? '#77ffb8ff' : status === 3 ? '#ffb453ff' : status === 4 ? '#ff4e55ff' : '#8be7ffff')
    const colorOffset = visualIndex * 4
    colors[colorOffset] = color.r
    colors[colorOffset + 1] = color.g
    colors[colorOffset + 2] = color.b
    colors[colorOffset + 3] = 1
  })
  controller.cities.thinInstanceSetBuffer('matrix', matrices, 16, false)
  controller.cities.thinInstanceSetBuffer('color', colors, 4, false)
}

function curvePoints(from: Vector3, to: Vector3) {
  const middle = from.add(to).scale(0.5).normalize().scale(EARTH_RADIUS + 0.12 + Vector3.Distance(from, to) * 0.12)
  return Array.from({ length: 29 }, (_, index) => {
    const t = index / 28
    const inverse = 1 - t
    return from.scale(inverse * inverse).add(middle.scale(2 * inverse * t)).add(to.scale(t * t))
  })
}

function clearMigration(controller: SceneController) {
  controller.migration.forEach(({ line, dots }) => {
    line.dispose(false, true)
    dots.forEach((dot) => dot.dispose(false, true))
  })
  controller.migration = []
}

function updateMigration(controller: SceneController, migration?: MigrationSummary) {
  clearMigration(controller)
  if (!migration?.routes.length) return
  for (let offset = 0; offset < migration.routes.length; offset += 5) {
    const from = latLonToVector(migration.routes[offset], migration.routes[offset + 1], EARTH_RADIUS + 0.028)
    const to = latLonToVector(migration.routes[offset + 2], migration.routes[offset + 3], EARTH_RADIUS + 0.028)
    const points = curvePoints(from, to)
    const routeColor = Color3.FromHexString(migration.routes[offset + 4] > 0.5 ? '#ffd166' : '#70f6d2')
    const line = MeshBuilder.CreateTube(`migration-${offset}`, {
      path: points,
      radius: migration.routes[offset + 4] > 0.5 ? 0.005 : 0.0032,
      tessellation: 6,
      cap: Mesh.NO_CAP,
    }, controller.scene)
    const routeMaterial = new StandardMaterial(`migration-mat-${offset}`, controller.scene)
    routeMaterial.emissiveColor = routeColor
    routeMaterial.diffuseColor = routeColor
    routeMaterial.disableLighting = true
    routeMaterial.alpha = 0.72
    line.material = routeMaterial
    line.parent = controller.root
    const dots = Array.from({ length: 2 }, (_, dotIndex) => {
      const dot = MeshBuilder.CreateSphere(`flow-${offset}-${dotIndex}`, { diameter: 0.022, segments: 7 }, controller.scene)
      const material = new StandardMaterial(`flow-mat-${offset}-${dotIndex}`, controller.scene)
      material.emissiveColor = routeColor
      material.diffuseColor = routeColor
      material.disableLighting = true
      dot.material = material
      dot.metadata = { phase: dotIndex / 2 + offset * 0.011 }
      dot.parent = controller.root
      return dot
    })
    controller.migration.push({ line, dots, points })
  }
}

function updateMarker(controller: SceneController, country: CountryProfile) {
  const normal = latLonToVector(country.lat, country.lon, 1).normalize()
  controller.marker.position.copyFrom(normal.scale(EARTH_RADIUS + 0.012))
  controller.marker.rotationQuaternion = normalQuaternion(normal)
  // Center a searched country on the visible meridian. The globe still moves,
  // but slowly enough that the selected marker remains useful during a turn.
  controller.root.rotation.y = Math.PI / 2 - country.lon * Math.PI / 180
}

async function setupScene(canvas: HTMLCanvasElement, onEngineChange?: (label: string) => void) {
  const { engine, label } = await createEngine(canvas)
  onEngineChange?.(label)
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.65))
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0, 0, 0, 0)
  scene.ambientColor = Color3.FromHexString('#17232d')
  scene.imageProcessingConfiguration.contrast = 1.04
  scene.imageProcessingConfiguration.exposure = 1

  const camera = new ArcRotateCamera('orbital-camera', -Math.PI / 2, Math.PI / 2.2, 5.25, Vector3.Zero(), scene)
  camera.lowerRadiusLimit = 3.5
  camera.upperRadiusLimit = 7
  camera.wheelPrecision = 55
  camera.pinchPrecision = 140
  camera.inertia = 0.82
  camera.attachControl(canvas, true)

  // ArcRotateCamera starts on the -Z hemisphere, so the key must travel
  // toward +Z to illuminate the face presented to the player.
  const key = new DirectionalLight('sun', new Vector3(-0.45, -0.35, 1), scene)
  key.intensity = 1.12
  key.diffuse = Color3.FromHexString('#fff8e8')
  const fill = new HemisphericLight('sky', new Vector3(0, 1, 0), scene)
  fill.intensity = 0.38
  fill.diffuse = Color3.FromHexString('#b8d7eb')
  fill.groundColor = Color3.FromHexString('#02070c')

  const root = new TransformNode('living-earth', scene)
  root.rotation = new Vector3(0.08, -0.62, -0.12)
  const core = MeshBuilder.CreateSphere('planet-core', { diameter: EARTH_RADIUS * 2, segments: 64 }, scene)
  core.parent = root
  const coreMaterial = new StandardMaterial('planet-core-material', scene)
  coreMaterial.diffuseColor = Color3.White()
  coreMaterial.specularColor = Color3.Black()
  coreMaterial.roughness = 0.72
  const earthAlbedo = new Texture(`${import.meta.env.BASE_URL}assets/earth-blue-marble-nasa.webp`, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE)
  earthAlbedo.gammaSpace = true
  earthAlbedo.anisotropicFilteringLevel = 8
  // Babylon's sphere starts longitude 0 at U=0; NASA's plate carrée starts at -180°.
  earthAlbedo.uOffset = 0.5
  coreMaterial.diffuseTexture = earthAlbedo
  coreMaterial.emissiveTexture = earthAlbedo
  coreMaterial.emissiveColor = Color3.FromHexString('#12171b')
  core.material = coreMaterial

  const atmosphere = MeshBuilder.CreateSphere('atmosphere', { diameter: (EARTH_RADIUS + 0.055) * 2, segments: 48 }, scene)
  atmosphere.parent = root
  const atmosphereMaterial = new StandardMaterial('atmosphere-material', scene)
  atmosphereMaterial.emissiveColor = Color3.FromHexString('#62bfff')
  atmosphereMaterial.alpha = 0.038
  atmosphereMaterial.backFaceCulling = false
  atmosphereMaterial.disableDepthWrite = true
  atmosphereMaterial.disableLighting = true
  atmosphere.material = atmosphereMaterial

  const tiles = MeshBuilder.CreateCylinder('climate-cells', { diameter: 1, height: 0.006, tessellation: 6 }, scene)
  tiles.parent = root
  tiles.alwaysSelectAsActiveMesh = true
  tiles.useVertexColors = true
  tiles.hasVertexAlpha = true
  const tileMaterial = new StandardMaterial('cell-material', scene)
  tileMaterial.diffuseColor = Color3.White()
  tileMaterial.emissiveColor = Color3.White()
  tileMaterial.specularColor = Color3.Black()
  tileMaterial.disableLighting = true
  tileMaterial.disableDepthWrite = true
  tileMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND
  tiles.material = tileMaterial

  const cities = MeshBuilder.CreateCylinder('city-signals', { diameter: 1, height: 1, tessellation: 6 }, scene)
  cities.parent = root
  cities.alwaysSelectAsActiveMesh = true
  cities.useVertexColors = true
  const cityMaterial = new StandardMaterial('city-material', scene)
  cityMaterial.diffuseColor = Color3.White()
  cityMaterial.ambientColor = Color3.White()
  cityMaterial.specularColor = Color3.Black()
  cityMaterial.roughness = 0.42
  cities.material = cityMaterial

  const marker = new TransformNode('selected-country', scene)
  marker.parent = root
  const markerRing = MeshBuilder.CreateTorus('selected-ring', { diameter: 0.105, thickness: 0.008, tessellation: 32 }, scene)
  markerRing.parent = marker
  const markerMaterial = new StandardMaterial('selected-material', scene)
  markerMaterial.emissiveColor = Color3.FromHexString('#efff9c')
  markerMaterial.disableLighting = true
  markerRing.material = markerMaterial
  const markerPin = MeshBuilder.CreateCylinder('selected-pin', { height: 0.075, diameterTop: 0.012, diameterBottom: 0.03, tessellation: 8 }, scene)
  markerPin.position.y = 0.047
  markerPin.parent = marker
  markerPin.material = markerMaterial

  const orbit = MeshBuilder.CreateTorus('policy-orbit', { diameter: 4.2, thickness: 0.006, tessellation: 96 }, scene)
  orbit.rotation.x = Math.PI / 2.5
  orbit.rotation.z = -0.22
  const orbitMaterial = new StandardMaterial('orbit-material', scene)
  orbitMaterial.emissiveColor = Color3.FromHexString('#59e4c2')
  orbitMaterial.alpha = 0.08
  orbitMaterial.disableLighting = true
  orbit.material = orbitMaterial

  const controller: SceneController = { engine, scene, root, tiles, cities, marker, migration: [] }
  let elapsed = 0
  scene.onBeforeRenderObservable.add(() => {
    const delta = engine.getDeltaTime() / 1000
    elapsed += delta
    controller.root.rotation.y += delta * 0.003
    const pulse = 1 + Math.sin(elapsed * 3.2) * 0.11
    controller.marker.scaling.setAll(pulse)
    controller.migration.forEach(({ dots, points }) => {
      dots.forEach((dot) => {
        const progress = (elapsed * 0.18 + Number(dot.metadata?.phase ?? 0)) % 1
        const pointIndex = Math.min(points.length - 1, Math.floor(progress * points.length))
        dot.position.copyFrom(points[pointIndex])
      })
    })
  })
  engine.runRenderLoop(() => scene.render())
  return controller
}

export function WorldScene({ temperature, cleanEnergy, country, world, migration, paused, onEngineChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<SceneController | undefined>(undefined)
  const latestRef = useRef({ temperature, cleanEnergy, country, world, migration, paused })

  useEffect(() => {
    latestRef.current = { temperature, cleanEnergy, country, world, migration, paused }
  }, [cleanEnergy, country, migration, paused, temperature, world])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let resizeObserver: ResizeObserver | undefined
    void setupScene(canvas, onEngineChange).then((controller) => {
      if (cancelled) {
        controller.engine.dispose()
        return
      }
      controllerRef.current = controller
      const latest = latestRef.current
      if (latest.world) {
        updateTiles(controller, latest.world, latest.temperature, latest.cleanEnergy)
        updateCities(controller, latest.world)
      }
      updateMigration(controller, latest.migration)
      updateMarker(controller, latest.country)
      resizeObserver = new ResizeObserver(() => controller.engine.resize())
      resizeObserver.observe(canvas)
    })
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      controllerRef.current?.engine.dispose()
      controllerRef.current = undefined
    }
  }, [onEngineChange])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !world) return
    updateTiles(controller, world, temperature, cleanEnergy)
    updateCities(controller, world)
  }, [cleanEnergy, temperature, world])

  useEffect(() => {
    if (controllerRef.current) updateMigration(controllerRef.current, migration)
  }, [migration])

  useEffect(() => {
    if (controllerRef.current) updateMarker(controllerRef.current, country)
  }, [country])

  useEffect(() => {
    if (!controllerRef.current) return
    if (paused) controllerRef.current.scene.animationsEnabled = false
    else controllerRef.current.scene.animationsEnabled = true
  }, [paused])

  return <canvas ref={canvasRef} className="world-canvas" aria-label="정책에 따라 변화하는 3D 지구 문명" />
}
