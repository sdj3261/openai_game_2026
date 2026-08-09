import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Scene } from '@babylonjs/core/scene'
import { useEffect, useRef } from 'react'
import type { Biome, CountryProjection } from '../types'

interface Props {
  biome: Biome
  projection: CountryProjection
  year: number
}

const palettes: Record<Biome, { land: string; high: string; water: string; accent: string }> = {
  temperate: { land: '#5d884f', high: '#38684e', water: '#397d96', accent: '#c5ef78' },
  tropical: { land: '#39895d', high: '#19634f', water: '#2f8698', accent: '#8ff0a4' },
  arid: { land: '#b7854b', high: '#80583d', water: '#397c9d', accent: '#ffd071' },
  coastal: { land: '#66945e', high: '#456b59', water: '#3484a5', accent: '#8bdeff' },
  arctic: { land: '#b8d8cf', high: '#7ea8a5', water: '#3c718d', accent: '#e6fff8' },
}

export function CountryDiorama({ biome, projection, year }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'low-power' })
    engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.4))
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0, 0, 0, 0)
    const camera = new ArcRotateCamera('diorama-camera', -Math.PI / 4, Math.PI / 3.2, 8, new Vector3(0, 0.2, 0), scene)
    camera.mode = ArcRotateCamera.ORTHOGRAPHIC_CAMERA
    camera.orthoLeft = -3.2
    camera.orthoRight = 3.2
    camera.orthoTop = 2.6
    camera.orthoBottom = -2.6
    camera.attachControl(canvas, true)
    camera.inputs.attached.mousewheel?.detachControl()
    const light = new HemisphericLight('diorama-fill', Vector3.Up(), scene)
    light.intensity = 1.3
    light.diffuse = Color3.FromHexString('#c8f9e8')
    const sun = new DirectionalLight('diorama-sun', new Vector3(-1, -2, -1), scene)
    sun.intensity = 2.2
    sun.diffuse = Color3.FromHexString('#fff1c4')

    const root = new TransformNode('future-country', scene)
    root.rotation.y = -0.35
    const palette = palettes[biome]
    const stress = projection.risk / 100
    const land = Color3.Lerp(Color3.FromHexString(palette.land), Color3.FromHexString('#a95936'), stress * 0.72)
    const high = Color3.Lerp(Color3.FromHexString(palette.high), Color3.FromHexString('#704032'), stress * 0.5)
    const flood = projection.seaLevelCm > 55 ? 1 : 0
    const terrainTexture = new Texture(`${import.meta.env.BASE_URL}assets/earth-surface-tile.webp`, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE)
    terrainTexture.uScale = 0.88
    terrainTexture.vScale = 0.88
    terrainTexture.anisotropicFilteringLevel = 4
    const landMaterial = new StandardMaterial('terrain-land', scene)
    landMaterial.diffuseColor = land
    landMaterial.diffuseTexture = terrainTexture
    landMaterial.specularColor = Color3.Black()
    const highMaterial = new StandardMaterial('terrain-high', scene)
    highMaterial.diffuseColor = high
    highMaterial.diffuseTexture = terrainTexture
    highMaterial.specularColor = Color3.Black()
    const waterMaterial = new StandardMaterial('terrain-water', scene)
    waterMaterial.diffuseColor = Color3.FromHexString(palette.water)
    waterMaterial.specularColor = Color3.FromHexString('#6ab5c4').scale(0.18)
    for (let x = -4; x <= 4; x += 1) {
      for (let z = -4; z <= 4; z += 1) {
        const isWater = (biome === 'coastal' || biome === 'tropical') && x < -2 + flood
        const wave = Math.sin(x * 1.7 + z * 2.1) * 0.28 + Math.cos(z * 1.2) * 0.18
        const height = isWater ? 0.12 : Math.max(0.28, 0.58 + wave + (x + z > 3 ? 0.35 : 0))
        const block = MeshBuilder.CreateBox(`terrain-${x}-${z}`, { width: 0.47, depth: 0.47, height }, scene)
        block.position = new Vector3(x * 0.48, height / 2 - 0.85, z * 0.48)
        block.parent = root
        block.material = isWater ? waterMaterial : height > 0.78 ? highMaterial : landMaterial
      }
    }

    const buildingMaterial = new StandardMaterial('building-material', scene)
    buildingMaterial.diffuseColor = Color3.FromHexString(projection.risk > 70 ? '#796b5f' : '#d5ddd0')
    buildingMaterial.emissiveColor = Color3.FromHexString(projection.risk > 70 ? '#5b231f' : palette.accent).scale(0.28)
    ;[-2, 0, 2].forEach((x, index) => {
      const height = 0.62 + index * 0.17
      const building = MeshBuilder.CreateBox(`building-${index}`, { width: 0.32, depth: 0.32, height }, scene)
      building.position = new Vector3(x * 0.5, height / 2 - 0.17, index % 2 === 0 ? 0.6 : -0.5)
      building.parent = root
      building.material = buildingMaterial
    })

    if (year > 2050 && projection.risk < 60) {
      const solar = MeshBuilder.CreateBox('solar-array', { width: 0.65, depth: 0.45, height: 0.04 }, scene)
      solar.position = new Vector3(1.55, 0.08, 1.15)
      solar.rotation.z = -0.14
      solar.parent = root
      const solarMaterial = new StandardMaterial('solar-material', scene)
      solarMaterial.diffuseColor = Color3.FromHexString('#173c59')
      solarMaterial.emissiveColor = Color3.FromHexString('#165579').scale(0.35)
      solar.material = solarMaterial
    }

    let elapsed = 0
    scene.onBeforeRenderObservable.add(() => {
      elapsed += engine.getDeltaTime() / 1000
      root.rotation.y = -0.35 + Math.sin(elapsed * 0.3) * 0.06
    })
    engine.runRenderLoop(() => scene.render())
    const resizeObserver = new ResizeObserver(() => engine.resize())
    resizeObserver.observe(canvas)
    return () => {
      resizeObserver.disconnect()
      engine.dispose()
    }
  }, [biome, projection.risk, projection.seaLevelCm, year])

  return <canvas ref={canvasRef} className="diorama-canvas" aria-label={`${year}년 국가 복셀 전망`} />
}
