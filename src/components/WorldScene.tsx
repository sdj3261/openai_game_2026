import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Scene } from '@babylonjs/core/scene'
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
  if (await WebGPUEngine.IsSupportedAsync) {
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
  if (!world.land[index]) return Color4.FromHexString('#0b526eff')
  const heat = Math.max(0, Math.min(1, (globalTemperature - 1.35) / 2.4))
  const disaster = world.disaster[index]
  if (disaster) return Color4.FromHexString(disaster === 2 ? '#4e9fd8ff' : disaster === 3 ? '#d79a42ff' : '#ff654fff')
  const biomeColors = ['#0b526e', '#64a858', '#23835d', '#bd8a4b', '#77956d', '#c7e1dd']
  const base = Color3.FromHexString(biomeColors[world.biome[index]] ?? '#5f9160')
  const stressed = Color3.FromHexString(world.habitability[index] < 0.4 ? '#bb5739' : '#bd8448')
  const color = Color3.Lerp(base, stressed, heat * 0.68 + Math.max(0, 0.48 - world.habitability[index]) * 0.8)
  if (cleanEnergy > 58 && index % 157 === 0) return new Color4(0.42, 1, 0.82, 1)
  return new Color4(color.r, color.g, color.b, 1)
}

function updateTiles(controller: SceneController, world: WorldSnapshot, temperature: number, cleanEnergy: number) {
  const matrices = new Float32Array(world.cellCount * 16)
  const colors = new Float32Array(world.cellCount * 4)
  const cellSize = world.cellCount >= 5000 ? 0.038 : 0.07
  for (let index = 0; index < world.cellCount; index += 1) {
    const normal = latLonToVector(world.latitude[index], world.longitude[index], 1).normalize()
    const isLand = world.land[index] === 1
    const terrainLift = isLand ? 0.052 + world.habitability[index] * 0.035 : 0.025
    const position = normal.scale(1.47 + terrainLift * 0.5)
    writeMatrix(matrices, index * 16, position, new Vector3(cellSize, terrainLift, cellSize), normalQuaternion(normal))
    const color = cellColor(world, index, temperature, cleanEnergy)
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
  const visible = cityIndices.slice(0, 340)
  const matrices = new Float32Array(visible.length * 16)
  const colors = new Float32Array(visible.length * 4)
  visible.forEach((cellIndex, visualIndex) => {
    const normal = latLonToVector(world.latitude[cellIndex], world.longitude[cellIndex], 1).normalize()
    const status = world.cityState[cellIndex]
    const livingHeight = 0.045 + Math.min(0.17, Math.sqrt(world.population[cellIndex]) * 0.018)
    const height = status === 4 ? 0.018 : status === 1 ? livingHeight * 1.18 : livingHeight
    const width = status === 4 ? 0.038 : 0.014 + Math.min(0.018, Math.sqrt(world.population[cellIndex]) * 0.002)
    writeMatrix(
      matrices,
      visualIndex * 16,
      normal.scale(1.535 + height * 0.5),
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
  const middle = from.add(to).scale(0.5).normalize().scale(2 + Vector3.Distance(from, to) * 0.22)
  return Array.from({ length: 29 }, (_, index) => {
    const t = index / 28
    const inverse = 1 - t
    return from.scale(inverse * inverse).add(middle.scale(2 * inverse * t)).add(to.scale(t * t))
  })
}

function clearMigration(controller: SceneController) {
  controller.migration.forEach(({ line, dots }) => {
    line.dispose()
    dots.forEach((dot) => dot.dispose())
  })
  controller.migration = []
}

function updateMigration(controller: SceneController, migration?: MigrationSummary) {
  clearMigration(controller)
  if (!migration?.routes.length) return
  for (let offset = 0; offset < migration.routes.length; offset += 5) {
    const from = latLonToVector(migration.routes[offset], migration.routes[offset + 1], 1.62)
    const to = latLonToVector(migration.routes[offset + 2], migration.routes[offset + 3], 1.62)
    const points = curvePoints(from, to)
    const line = MeshBuilder.CreateLines(`migration-${offset}`, { points }, controller.scene)
    line.color = Color3.FromHexString(migration.routes[offset + 4] > 0.5 ? '#ffd166' : '#70f6d2')
    line.alpha = 0.7
    line.parent = controller.root
    const dots = Array.from({ length: 3 }, (_, dotIndex) => {
      const dot = MeshBuilder.CreateSphere(`flow-${offset}-${dotIndex}`, { diameter: 0.025 }, controller.scene)
      const material = new StandardMaterial(`flow-mat-${offset}-${dotIndex}`, controller.scene)
      material.emissiveColor = line.color
      material.disableLighting = true
      dot.material = material
      dot.metadata = { phase: dotIndex / 3 + offset * 0.011 }
      dot.parent = controller.root
      return dot
    })
    controller.migration.push({ line, dots, points })
  }
}

function updateMarker(controller: SceneController, country: CountryProfile) {
  const normal = latLonToVector(country.lat, country.lon, 1).normalize()
  controller.marker.position.copyFrom(normal.scale(1.7))
  controller.marker.rotationQuaternion = normalQuaternion(normal)
}

async function setupScene(canvas: HTMLCanvasElement, onEngineChange?: (label: string) => void) {
  const { engine, label } = await createEngine(canvas)
  onEngineChange?.(label)
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.65))
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0, 0, 0, 0)
  scene.ambientColor = Color3.FromHexString('#142821')

  const camera = new ArcRotateCamera('orbital-camera', -Math.PI / 2, Math.PI / 2.2, 5.25, Vector3.Zero(), scene)
  camera.lowerRadiusLimit = 3.5
  camera.upperRadiusLimit = 7
  camera.wheelPrecision = 55
  camera.pinchPrecision = 140
  camera.inertia = 0.82
  camera.attachControl(canvas, true)

  const key = new DirectionalLight('sun', new Vector3(-0.7, -0.45, -0.8), scene)
  key.intensity = 3.2
  key.diffuse = Color3.FromHexString('#fff0c8')
  const fill = new HemisphericLight('sky', new Vector3(0, 1, 0), scene)
  fill.intensity = 0.85
  fill.diffuse = Color3.FromHexString('#9ae8d0')
  fill.groundColor = Color3.FromHexString('#07131e')
  const rim = new PointLight('rim', new Vector3(-4, -1, -3), scene)
  rim.diffuse = Color3.FromHexString('#2079ff')
  rim.intensity = 22

  const root = new TransformNode('living-earth', scene)
  root.rotation = new Vector3(0.08, -0.62, -0.12)
  const core = MeshBuilder.CreateSphere('planet-core', { diameter: 2.92, segments: 48 }, scene)
  core.parent = root
  const coreMaterial = new StandardMaterial('planet-core-material', scene)
  coreMaterial.diffuseColor = Color3.FromHexString('#061c25')
  coreMaterial.specularColor = Color3.FromHexString('#173441')
  coreMaterial.roughness = 0.8
  core.material = coreMaterial

  const atmosphere = MeshBuilder.CreateSphere('atmosphere', { diameter: 3.3, segments: 40 }, scene)
  atmosphere.parent = root
  const atmosphereMaterial = new StandardMaterial('atmosphere-material', scene)
  atmosphereMaterial.emissiveColor = Color3.FromHexString('#49cfff')
  atmosphereMaterial.alpha = 0.07
  atmosphereMaterial.backFaceCulling = false
  atmosphereMaterial.disableLighting = true
  atmosphere.material = atmosphereMaterial

  const tiles = MeshBuilder.CreateBox('geodesic-cells', { size: 1 }, scene)
  tiles.parent = root
  tiles.alwaysSelectAsActiveMesh = true
  tiles.useVertexColors = true
  const tileMaterial = new StandardMaterial('cell-material', scene)
  tileMaterial.diffuseColor = Color3.White()
  tileMaterial.specularColor = Color3.FromHexString('#13231d')
  tileMaterial.roughness = 0.74
  tiles.material = tileMaterial

  const cities = MeshBuilder.CreateBox('city-signals', { size: 1 }, scene)
  cities.parent = root
  cities.alwaysSelectAsActiveMesh = true
  cities.useVertexColors = true
  const cityMaterial = new StandardMaterial('city-material', scene)
  cityMaterial.diffuseColor = Color3.White()
  cityMaterial.emissiveColor = Color3.FromHexString('#28615c')
  cityMaterial.roughness = 0.3
  cities.material = cityMaterial

  const marker = new TransformNode('selected-country', scene)
  marker.parent = root
  const markerRing = MeshBuilder.CreateTorus('selected-ring', { diameter: 0.23, thickness: 0.022, tessellation: 32 }, scene)
  markerRing.parent = marker
  const markerMaterial = new StandardMaterial('selected-material', scene)
  markerMaterial.emissiveColor = Color3.FromHexString('#efff9c')
  markerMaterial.disableLighting = true
  markerRing.material = markerMaterial
  const markerPin = MeshBuilder.CreateCylinder('selected-pin', { height: 0.19, diameterTop: 0.025, diameterBottom: 0.065, tessellation: 8 }, scene)
  markerPin.position.y = 0.15
  markerPin.parent = marker
  markerPin.material = markerMaterial

  const orbit = MeshBuilder.CreateTorus('policy-orbit', { diameter: 4.2, thickness: 0.006, tessellation: 96 }, scene)
  orbit.rotation.x = Math.PI / 2.5
  orbit.rotation.z = -0.22
  const orbitMaterial = new StandardMaterial('orbit-material', scene)
  orbitMaterial.emissiveColor = Color3.FromHexString('#59e4c2')
  orbitMaterial.alpha = 0.2
  orbitMaterial.disableLighting = true
  orbit.material = orbitMaterial

  const glow = new GlowLayer('civilization-glow', scene, { blurKernelSize: 24 })
  glow.intensity = 0.48

  const controller: SceneController = { engine, scene, root, tiles, cities, marker, migration: [] }
  let elapsed = 0
  scene.onBeforeRenderObservable.add(() => {
    const delta = engine.getDeltaTime() / 1000
    elapsed += delta
    controller.root.rotation.y += delta * 0.025
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
