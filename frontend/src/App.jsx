import { useMemo, useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'
import {
  apiAuditLog,
  apiAuditTimeline,
  apiDock,
  apiExpand,
  apiGetModules,
  apiGetPosition,
  apiHealth,
  apiPredictTrack,
  apiStations,
  apiStationLink,
  apiSecureEncrypt,
  apiScosPermit,
  apiAiRecommendation,
  apiJudgeAnalytics,
  apiSetModuleAttached,
  apiSetModuleVisibility,
} from './api'

// ========== ПРЕЗАГРУЗКА МОДЕЛЕЙ ==========
useGLTF.preload('/models/z1_base.glb')
useGLTF.preload('/models/uslab_laboratory.glb')
useGLTF.preload('/models/solar_panel_power.glb')
useGLTF.preload('/models/airlock_hub.glb')
useGLTF.preload('/models/fgb_base.glb')
useGLTF.preload('/models/columbus_laboratory.glb')

// ========== КОМПОНЕНТ ЗЕМЛИ ==========
function Earth({ enabled, scaleMode }) {
  const earthRef = useRef()
  const [dayMap, nightMap, normalMap, specMap, cloudsMap] = useTexture([
    '/textures/earth_atmos_2048.jpg',
    '/textures/earth_lights_2048.png',
    '/textures/earth_normal_2048.jpg',
    '/textures/earth_specular_2048.jpg',
    '/textures/earth_clouds_1024.png',
  ])

  useEffect(() => {
    // Ensure correct color spaces (three r152+)
    if (dayMap) dayMap.colorSpace = THREE.SRGBColorSpace
    if (nightMap) nightMap.colorSpace = THREE.SRGBColorSpace
    if (cloudsMap) cloudsMap.colorSpace = THREE.SRGBColorSpace
  }, [dayMap, nightMap, cloudsMap])

  const earthShader = useMemo(() => {
    return {
      uniforms: {
        uDay: { value: dayMap },
        uNight: { value: nightMap },
        uSunDir: { value: new THREE.Vector3(1, 0.1, 0.3).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main(){
          vUv = uv;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main(){
          vec3 n = normalize(vNormalW);
          float ndl = dot(n, normalize(uSunDir));
          float k = smoothstep(-0.1, 0.25, ndl);
          vec3 dayCol = texture2D(uDay, vUv).rgb;
          vec3 nightCol = texture2D(uNight, vUv).rgb;
          // Slightly dim day, boost night lights
          dayCol *= 0.98;
          nightCol = pow(nightCol, vec3(1.0/1.6)) * 1.6;
          vec3 col = mix(nightCol, dayCol, k);
          // Twilight tint
          float tw = smoothstep(-0.25, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.22, ndl));
          col += vec3(0.9, 0.35, 0.15) * tw * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }
  }, [dayMap, nightMap])

  const radius = scaleMode === 'real' ? 30 : 18
  
  useFrame((state, delta) => {
    if (enabled && earthRef.current) {
      earthRef.current.rotation.y += delta * 0.02
    }
  })

  if (!enabled) return null

  return (
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial attach="material" args={[earthShader]} />
      </mesh>
      {/* Surface details */}
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial
          transparent
          opacity={0.22}
          normalMap={normalMap || null}
          metalness={0.0}
          roughness={0.9}
        />
      </mesh>
      {/* Specular-like shine (oceans) */}
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial
          transparent
          opacity={0.28}
          metalness={0.35}
          roughness={0.35}
          alphaMap={specMap || null}
          color={'#bfe8ff'}
        />
      </mesh>
      {/* Clouds */}
      <mesh scale={[1.01, 1.01, 1.01]}>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial
          map={cloudsMap || null}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      {/* Atmosphere glow */}
      <mesh scale={[1.03, 1.03, 1.03]}>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            glowColor: { value: new THREE.Color('#58c7ff') },
            intensity: { value: 0.65 },
          }}
          vertexShader={`
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldPos = worldPos.xyz;
              gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
          `}
          fragmentShader={`
            uniform vec3 glowColor;
            uniform float intensity;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.6);
              float a = fresnel * intensity;
              gl_FragColor = vec4(glowColor, a);
            }
          `}
        />
      </mesh>
    </group>
  )
}

// ========== КОМПОНЕНТ МОДУЛЯ ==========
function StationModule({ module, position, onClick, language, selected }) {
  const [hovered, setHovered] = useState(false)

  const modelPaths = {
    'base': '/models/z1_base.glb',
    'laboratory': '/models/uslab_laboratory.glb',
    'power': '/models/solar_panel_power.glb',
    'hub': '/models/airlock_hub.glb',
    'service': '/models/fgb_base.glb',
    'expansion': '/models/columbus_laboratory.glb',
    'docking': '/models/pma1_docking.glb'
  }

  const handleClick = useCallback(() => {
    if (onClick) onClick(module)
  }, [onClick, module])

  const moduleType = module?.type || 'base'
  const modelPath = modelPaths[moduleType] || '/models/z1_base.glb'
  const { scene } = useGLTF(modelPath)
  const model = scene

  // Improve readability: brighten materials for space lighting
  useEffect(() => {
    if (!model) return
    model.traverse((obj) => {
      if (!obj.isMesh) return
      obj.castShadow = false
      obj.receiveShadow = false
      const mat = obj.material
      if (mat && typeof mat === 'object') {
        const mats = Array.isArray(mat) ? mat : [mat]
        for (const m of mats) {
          if (!m) continue
          m.side = THREE.DoubleSide
          if ('metalness' in m) m.metalness = Math.min(0.6, m.metalness ?? 0.2)
          if ('roughness' in m) m.roughness = Math.max(0.25, m.roughness ?? 0.6)
          if ('emissive' in m) {
            m.emissive = new THREE.Color('#0b3a4f')
            m.emissiveIntensity = 0.25
          }
          m.needsUpdate = true
        }
      }
    })
  }, [model])

  if (!module) {
    return null
  }

  // Fallback геометрия если модель не загрузилась
  if (!model) {
    const colors = {
      base: '#4a6a8a',
      laboratory: '#5a7a9a',
      power: '#2a2a4a',
      hub: '#6a8aaa',
      service: '#3a5a7a',
      expansion: '#4a5a7a',
      docking: '#5a6a8a'
    }
    const color = colors[module.type] || '#4a6a8a'

    return (
      <group position={position} onClick={handleClick} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        {module.type === 'power' ? (
          <mesh>
            <boxGeometry args={[4, 0.1, 2]} />
            <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
          </mesh>
        ) : (
          <mesh>
            <cylinderGeometry args={[1, 1, 3, 16]} />
            <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
          </mesh>
        )}
        {hovered && (
          <Html distanceFactor={15}>
            <div style={{ background: 'rgba(0,0,0,0.9)', color: '#00d4ff', padding: '8px 12px', border: '1px solid #00d4ff', fontFamily: 'Segoe UI, sans-serif', fontSize: '12px', borderRadius: '4px' }}>
              {language === 'ru' ? module.nameRu : module.name}
            </div>
          </Html>
        )}
      </group>
    )
  }

  return (
    <group position={position} onClick={handleClick} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <primitive object={model.clone()} scale={0.08} />
      {selected ? (
        <mesh>
          <torusGeometry args={[1.8, 0.07, 10, 42]} />
          <meshStandardMaterial color={'#9b7bff'} emissive={'#9b7bff'} emissiveIntensity={0.8} />
        </mesh>
      ) : null}
      {hovered && (
        <Html distanceFactor={15}>
          <div style={{ background: 'rgba(0,0,0,0.9)', color: '#00d4ff', padding: '8px 12px', border: '1px solid #00d4ff', fontFamily: 'Segoe UI, sans-serif', fontSize: '12px', borderRadius: '4px' }}>
            {language === 'ru' ? module.nameRu : module.name}
          </div>
        </Html>
      )}
    </group>
  )
}

function DockingAnimatedModule({ module, from, to, durationMs, onDone, language }) {
  const groupRef = useRef()
  const startRef = useRef(null)
  const doneRef = useRef(false)

  useFrame(() => {
    if (!groupRef.current) return
    if (doneRef.current) return
    if (startRef.current === null) startRef.current = performance.now()

    const elapsed = performance.now() - startRef.current
    const t = Math.min(1, elapsed / durationMs)
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

    groupRef.current.position.set(
      THREE.MathUtils.lerp(from[0], to[0], ease),
      THREE.MathUtils.lerp(from[1], to[1], ease),
      THREE.MathUtils.lerp(from[2], to[2], ease),
    )

    if (t >= 1) {
      doneRef.current = true
      onDone?.()
    }
  })

  return (
    <group ref={groupRef}>
      <StationModule module={module} position={[0, 0, 0]} onClick={undefined} language={language} />
    </group>
  )
}

// ========== 3D СЦЕНА ==========
function Scene({ modules, orientation, orbitHeightKm, dockingAnim, onDockingDone, onModuleClick, language, showEarth, scaleMode, selectedModuleId, cameraPreset }) {
  const stationRef = useRef()
  const controlsRef = useRef()
  const { camera } = useThree()
  
  useFrame((state, delta) => {
    if (stationRef.current) {
      stationRef.current.rotation.x = THREE.MathUtils.lerp(stationRef.current.rotation.x, orientation.x * Math.PI / 180, delta * 2)
      stationRef.current.rotation.y = THREE.MathUtils.lerp(stationRef.current.rotation.y, orientation.y * Math.PI / 180, delta * 2)
    }
    const presets = {
      overview: [0, 0, scaleMode === 'real' ? 160 : 100],
      docking: [14, 10, stationDistance + 26],
      earth: [0, 44, scaleMode === 'real' ? 120 : 85],
      module: [10, 8, stationDistance + 20],
    }
    const targetPos = presets[cameraPreset] || presets.overview
    camera.position.lerp(new THREE.Vector3(...targetPos), Math.min(1, delta * 1.5))
    if (controlsRef.current) {
      controlsRef.current.target.lerp(new THREE.Vector3(0, 0, stationDistance), Math.min(1, delta * 2))
      controlsRef.current.update()
    }
  })

  const visibleModules = modules.filter(m => m && m.visible && m.attached)
  const stationDistance =
    scaleMode === 'real'
      ? THREE.MathUtils.mapLinear(orbitHeightKm, 400, 2000, 145, 260)
      : THREE.MathUtils.mapLinear(orbitHeightKm, 400, 2000, 85, 150)
  const stationWorld = [0, 0, stationDistance]
  const modulePosScale = scaleMode === 'real' ? 0.18 : 0.45
  const dockingPortLocal = [0, 0, 0]
  const dockingTargetWorld = [stationWorld[0] + dockingPortLocal[0], stationWorld[1] + dockingPortLocal[1], stationWorld[2] + dockingPortLocal[2]]
  const dockingFromWorld = [stationWorld[0] + 0, stationWorld[1] + 0, stationWorld[2] + 55]

  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight intensity={0.75} color={'#cfe8ff'} groundColor={'#1b2a45'} />
      <directionalLight position={[12, 8, 18]} intensity={1.35} color={'#ffffff'} />
      <pointLight position={[-8, -5, 10]} intensity={0.65} color={'#7b5cff'} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Earth enabled={showEarth} scaleMode={scaleMode} />
      <group position={stationWorld} ref={stationRef}>
        {visibleModules.map((module, index) => {
          const x0 = module.position?.x ?? 0
          const y0 = module.position?.y ?? 0
          const z0 = module.position?.z ?? (index * 8 - visibleModules.length * 4)
          const x = x0 * modulePosScale
          const y = y0 * modulePosScale
          const z = z0 * modulePosScale
          return (
            <StationModule 
              key={module.id} 
              module={module} 
              position={[x, y, z]} 
              onClick={onModuleClick}
              language={language}
              selected={module.id === selectedModuleId}
            />
          )
        })}
      </group>
      {/* Docking target marker (HUD-style ring) */}
      <mesh position={dockingTargetWorld}>
        <torusGeometry args={[1.6, 0.08, 10, 48]} />
        <meshStandardMaterial color={'#00d4ff'} emissive={'#00d4ff'} emissiveIntensity={0.8} />
      </mesh>
      {dockingAnim?.module ? (
        <DockingAnimatedModule
          module={dockingAnim.module}
          from={dockingFromWorld}
          to={dockingTargetWorld}
          durationMs={dockingAnim.durationMs}
          onDone={onDockingDone}
          language={language}
        />
      ) : null}
      <OrbitControls ref={controlsRef} enablePan={true} enableZoom={true} enableRotate={true} minDistance={10} maxDistance={300} />
    </>
  )
}

// ========== ОСНОВНОЙ КОМПОНЕНТ ==========
function App() {
  const [orbitHeight, setOrbitHeight] = useState(420)
  const [inclination, setInclination] = useState(51.6)
  const [orientation, setOrientation] = useState({ x: 0, y: 0, z: 0 })
  const [panelAngle, setPanelAngle] = useState(0)
  const [language, setLanguage] = useState('ru')
  const [isDocking, setIsDocking] = useState(false)
  const [auditLog, setAuditLog] = useState([])
  const [timeline, setTimeline] = useState([])
  const [timelineFilter, setTimelineFilter] = useState('all')
  const [predict, setPredict] = useState(null)
  const [stations, setStations] = useState([])
  const [link, setLink] = useState(null)
  const [securePacket, setSecurePacket] = useState(null)
  const [aiRecommendation, setAiRecommendation] = useState(null)
  const [judgeAnalytics, setJudgeAnalytics] = useState(null)
  const [scosPermit, setScosPermit] = useState(null)
  const [isAutoDemo, setIsAutoDemo] = useState(false)
  const [demoStepLabel, setDemoStepLabel] = useState('')
  const [demoTimeLeft, setDemoTimeLeft] = useState(0)
  const demoTimersRef = useRef([])
  const [apiStatus, setApiStatus] = useState({ ok: false, message: '...' })
  const [position, setPosition] = useState(null)
  const [dockingAnim, setDockingAnim] = useState(null)
  const [scaleMode, setScaleMode] = useState('demo') // 'demo' | 'real'
  const [showEarth, setShowEarth] = useState(true)
  const [appMode, setAppMode] = useState('twin') // 'twin' | 'training' | 'presentation'
  const [trainingStep, setTrainingStep] = useState(0)
  const [selectedModuleId, setSelectedModuleId] = useState(null)
  const [cameraPreset, setCameraPreset] = useState('overview')
  
  const [modules, setModules] = useState([])

  const refreshAudit = useCallback(async () => {
    try {
      const data = await apiAuditLog(20)
      setAuditLog((data?.audit_log || []).slice(0, 10).reverse())
    } catch {
      // ignore
    }
  }, [])

  const refreshTimeline = useCallback(async () => {
    try {
      const data = await apiAuditTimeline(250)
      setTimeline(data?.events || [])
    } catch {
      // ignore
    }
  }, [])

  const refreshPredict = useCallback(async () => {
    try {
      const data = await apiPredictTrack(6, 30)
      setPredict(data)
    } catch {
      // ignore
    }
  }, [])

  const refreshStations = useCallback(async () => {
    try {
      const data = await apiStations()
      const list = data?.stations || []
      setStations(list)
      if (list.length >= 2) {
        try {
          const l = await apiStationLink(list[0].id, list[1].id)
          setLink(l)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const refreshSecurePacket = useCallback(async () => {
    try {
      const payload = JSON.stringify({
        t: new Date().toISOString(),
        mode: appMode,
        orbitHeight,
        orientation,
      })
      const data = await apiSecureEncrypt(payload)
      setSecurePacket(data)
    } catch {
      // ignore
    }
  }, [appMode, orbitHeight, orientation])

  const refreshAi = useCallback(async () => {
    try {
      const rec = await apiAiRecommendation()
      setAiRecommendation(rec)
    } catch {
      // ignore
    }
  }, [])

  const refreshJudge = useCallback(async () => {
    try {
      const data = await apiJudgeAnalytics()
      setJudgeAnalytics(data)
    } catch {
      // ignore
    }
  }, [])

  const refreshScosPermit = useCallback(async () => {
    try {
      const data = await apiScosPermit('district-demo-001', 'celestrak.org', 443, 300)
      setScosPermit(data)
    } catch {
      // ignore
    }
  }, [])

  const refreshModules = useCallback(async () => {
    const data = await apiGetModules()
    setModules(data.modules || [])
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const health = await apiHealth()
        if (cancelled) return
        setApiStatus({ ok: true, message: `${health.status}` })
        await refreshModules()
        await refreshAudit()
        await refreshTimeline()
        await refreshPredict()
        await refreshStations()
        await refreshSecurePacket()
        await refreshAi()
        await refreshJudge()
        await refreshScosPermit()
      } catch (e) {
        if (cancelled) return
        setApiStatus({ ok: false, message: e?.message || 'offline' })
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [refreshModules, refreshAudit, refreshTimeline, refreshPredict, refreshStations, refreshSecurePacket, refreshAi, refreshJudge, refreshScosPermit])

  useEffect(() => {
    let cancelled = false
    let timer = null

    async function tick() {
      try {
        const pos = await apiGetPosition()
        if (!cancelled) setPosition(pos)
      } catch {
        // ignore
      }
      timer = setTimeout(tick, 3000)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const handleDock = () => {
    if (isDocking || dockingAnim) return

    const availableModule = modules.find(m => !m.attached)
    if (!availableModule) return

    setIsDocking(true)
    setDockingAnim({
      module: { ...availableModule, visible: true },
      durationMs: 2400,
    })

    apiDock(availableModule.name)
      .then(() => {
        refreshAudit()
        refreshTimeline()
      })
      .catch(() => {})
  }

  const toggleModule = (id) => {
    const m = modules.find(x => x.id === id)
    if (!m) return
    const nextVisible = !m.visible
    setModules(prev => prev.map(x => (x.id === id ? { ...x, visible: nextVisible } : x)))
    apiSetModuleVisibility(id, nextVisible).then(() => { refreshAudit(); refreshTimeline() }).catch(() => {})
  }

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ru' ? 'en' : 'ru')
  }

  const t = {
    ru: {
      parameters: 'ПАРАМЕТРЫ',
      orbitHeight: 'Высота орбиты',
      orientation: 'Ориентация',
      inclination: 'Наклонение',
      panelAngle: 'Угол панелей',
      modules: 'МОДУЛИ СТАНЦИИ',
      addModule: 'ДОБАВИТЬ МОДУЛЬ',
      save: 'СОХРАНИТЬ',
      docking: 'СТЫКОВКА',
      ready: 'Готов к стыковке',
      upload: 'ЗАГРУЗИТЬ МОДЕЛЬ СТАНЦИИ (GLB/GLTF/OBJ)',
      language: 'ENGLISH',
      api: 'API',
      connected: 'Подключено',
      disconnected: 'Нет связи',
      attached: 'Подключен',
      available: 'Доступен',
      lat: 'Широта',
      lon: 'Долгота',
      alt: 'Высота',
      scaleMode: 'Масштаб',
      scaleDemo: 'Демо',
      scaleReal: 'Реальный',
      environment: 'Окружение',
      showEarth: 'Показывать Землю',
      mode: 'Режим',
      modeTwin: 'Двойник',
      modeTraining: 'Тренажёр',
      modePresentation: 'Презентация',
      guidance: 'Подсказка',
      step1: 'Шаг 1: выбери модуль для стыковки (кнопка “Стыковка”).',
      step2: 'Шаг 2: наблюдай сближение и совмещение с портом (кольцо).',
      step3: 'Шаг 3: модуль станет частью станции и появится в составе.',
    },
    en: {
      parameters: 'PARAMETERS',
      orbitHeight: 'Orbit Height',
      orientation: 'Orientation',
      inclination: 'Inclination',
      panelAngle: 'Panel Angle',
      modules: 'STATION MODULES',
      addModule: 'ADD MODULE',
      save: 'SAVE',
      docking: 'DOCKING',
      ready: 'Ready for docking',
      upload: 'UPLOAD STATION MODEL (GLB/GLTF/OBJ)',
      language: 'РУССКИЙ',
      api: 'API',
      connected: 'Connected',
      disconnected: 'Offline',
      attached: 'Attached',
      available: 'Available',
      lat: 'Lat',
      lon: 'Lon',
      alt: 'Alt',
      scaleMode: 'Scale',
      scaleDemo: 'Demo',
      scaleReal: 'Real',
      environment: 'Environment',
      showEarth: 'Show Earth',
      mode: 'Mode',
      modeTwin: 'Twin',
      modeTraining: 'Training',
      modePresentation: 'Presentation',
      guidance: 'Guidance',
      step1: 'Step 1: start docking (press “Docking”).',
      step2: 'Step 2: observe approach and alignment to the port (ring).',
      step3: 'Step 3: module becomes part of the station and appears in the list.',
    }
  }

  const texts = t[language]

  useEffect(() => {
    if (appMode !== 'training') return
    setTrainingStep(1)
  }, [appMode])

  useEffect(() => {
    if (appMode !== 'training') return
    if (isDocking || dockingAnim) setTrainingStep(2)
  }, [appMode, isDocking, dockingAnim])

  useEffect(() => {
    const t = setInterval(() => {
      refreshSecurePacket()
    }, 8000)
    return () => clearInterval(t)
  }, [refreshSecurePacket])

  const clearDemoTimers = () => {
    for (const t of demoTimersRef.current) clearTimeout(t)
    demoTimersRef.current = []
  }

  const stopMissionDirectorDemo = () => {
    clearDemoTimers()
    setIsAutoDemo(false)
    setDemoStepLabel('')
    setDemoTimeLeft(0)
  }

  const startMissionDirectorDemo = () => {
    if (isAutoDemo) return
    clearDemoTimers()
    const totalMs = 16500
    const startedAt = Date.now()

    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((totalMs - (Date.now() - startedAt)) / 1000))
      setDemoTimeLeft(left)
      if (left <= 0) clearInterval(tick)
    }, 250)
    demoTimersRef.current.push(tick)

    setIsAutoDemo(true)
    setAppMode('presentation')
    setDemoStepLabel('Initialize presentation mode')
    setCameraPreset('overview')
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Switch to real scale')
      setScaleMode('real')
    }, 1200))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Enable Earth context')
      setShowEarth(true)
    }, 2200))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Earth camera pass')
      setCameraPreset('earth')
    }, 3500))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Docking camera setup')
      setCameraPreset('docking')
    }, 5200))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Run docking sequence')
      handleDock()
    }, 6500))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Update trajectory forecast')
      refreshPredict()
    }, 9000))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Update inter-station links')
      refreshStations()
    }, 10200))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Send secure telemetry packet')
      refreshSecurePacket()
    }, 11400))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Issue SCOS permit')
      refreshScosPermit()
    }, 12600))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Compute judge KPI score')
      refreshJudge()
    }, 13800))
    demoTimersRef.current.push(setTimeout(() => {
      setDemoStepLabel('Demo complete')
      setCameraPreset('overview')
      setIsAutoDemo(false)
      setTimeout(() => {
        setDemoStepLabel('')
        setDemoTimeLeft(0)
      }, 1200)
    }, 16500))
  }

  useEffect(() => {
    return () => clearDemoTimers()
  }, [])

  return (
    <div className="app-container">
      {/* ЛЕВАЯ ПАНЕЛЬ - ПАРАМЕТРЫ */}
      <div className="panel left-panel">
        <div className="panel-header">
          <span className="panel-icon">⚙</span>
          <span className="panel-title">{texts.parameters}</span>
        </div>
        
        <div className="control-group">
          <div className="control-label">
            <span className="label-icon">🛰</span>
            <span>{texts.orbitHeight}</span>
            <span className="label-value">{orbitHeight} км</span>
          </div>
          <input
            type="range"
            min="400"
            max="2000"
            value={orbitHeight}
            onChange={(e) => {
              setOrbitHeight(Number(e.target.value))
            }}
            className="slider"
          />
        </div>

        <div className="control-group">
          <div className="control-label">
            <span className="label-icon">🔄</span>
            <span>{texts.orientation}</span>
            <span className="label-value">{orientation.y}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={orientation.y}
            onChange={(e) => {
              setOrientation({...orientation, y: Number(e.target.value)})
            }}
            className="slider"
          />
        </div>

        <div className="control-group">
          <div className="control-label">
            <span className="label-icon">📐</span>
            <span>{texts.inclination}</span>
            <span className="label-value">{inclination}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="90"
            step="0.1"
            value={inclination}
            onChange={(e) => {
              setInclination(Number(e.target.value))
            }}
            className="slider"
          />
        </div>

        <div className="control-group">
          <div className="control-label">
            <span className="label-icon">☀</span>
            <span>{texts.panelAngle}</span>
            <span className="label-value">{panelAngle}°</span>
          </div>
          <input
            type="range"
            min="-180"
            max="180"
            value={panelAngle}
            onChange={(e) => {
              setPanelAngle(Number(e.target.value))
            }}
            className="slider"
          />
        </div>

        <div className="status-bar">
          <div className={`status-indicator ${apiStatus.ok ? 'online' : 'offline'}`}></div>
          <span>
            {texts.api}: {apiStatus.ok ? texts.connected : texts.disconnected}
            {apiStatus.ok ? '' : ` (${apiStatus.message})`}
          </span>
        </div>

        {position ? (
          <div className="control-group" style={{ marginTop: 15 }}>
            <div className="control-label">
              <span className="label-icon">📡</span>
              <span>{texts.lat}</span>
              <span className="label-value">{Number(position.latitude).toFixed(2)}°</span>
            </div>
            <div className="control-label" style={{ marginTop: 6 }}>
              <span className="label-icon">🌐</span>
              <span>{texts.lon}</span>
              <span className="label-value">{Number(position.longitude).toFixed(2)}°</span>
            </div>
            <div className="control-label" style={{ marginTop: 6 }}>
              <span className="label-icon">🛰</span>
              <span>{texts.alt}</span>
              <span className="label-value">{Number(position.altitude_km).toFixed(0)} km</span>
            </div>
          </div>
        ) : null}

        <div className="control-group" style={{ marginTop: 15 }}>
          <div className="control-label">
            <span className="label-icon">🧭</span>
            <span>{texts.scaleMode}</span>
            <span className="label-value">{scaleMode === 'real' ? texts.scaleReal : texts.scaleDemo}</span>
          </div>
          <div className="button-row" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
            <button
              className="secondary-btn"
              onClick={() => setScaleMode('demo')}
              style={{ opacity: scaleMode === 'demo' ? 1 : 0.65 }}
            >
              {texts.scaleDemo}
            </button>
            <button
              className="secondary-btn"
              onClick={() => setScaleMode('real')}
              style={{ opacity: scaleMode === 'real' ? 1 : 0.65 }}
            >
              {texts.scaleReal}
            </button>
          </div>
        </div>

        <div className="control-group" style={{ marginTop: 15 }}>
          <div className="control-label">
            <span className="label-icon">🌍</span>
            <span>{texts.environment}</span>
            <span className="label-value">{showEarth ? 'ON' : 'OFF'}</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(232,238,248,0.85)' }}>
            <input
              type="checkbox"
              checked={showEarth}
              onChange={(e) => setShowEarth(e.target.checked)}
            />
            {texts.showEarth}
          </label>
        </div>
      </div>

      {/* ЦЕНТРАЛЬНАЯ 3D СЦЕНА */}
      <div className="main-view">
        <div className="language-toggle" onClick={toggleLanguage}>
          {texts.language}
        </div>
        <div className="hud">
          <div className="hud-card">
            <div className="hud-title">{texts.mode}</div>
            <div className="mode-pills">
              <button className={`pill ${appMode === 'twin' ? 'active' : ''}`} onClick={() => setAppMode('twin')}>
                {texts.modeTwin}
              </button>
              <button className={`pill ${appMode === 'training' ? 'active' : ''}`} onClick={() => setAppMode('training')}>
                {texts.modeTraining}
              </button>
              <button className={`pill ${appMode === 'presentation' ? 'active' : ''}`} onClick={() => setAppMode('presentation')}>
                {texts.modePresentation}
              </button>
            </div>
          </div>
          <div className="hud-card">
            <div className="hud-title">Camera</div>
            <div className="mode-pills" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className={`pill ${cameraPreset === 'overview' ? 'active' : ''}`} onClick={() => setCameraPreset('overview')}>Overview</button>
              <button className={`pill ${cameraPreset === 'docking' ? 'active' : ''}`} onClick={() => setCameraPreset('docking')}>Docking</button>
              <button className={`pill ${cameraPreset === 'earth' ? 'active' : ''}`} onClick={() => setCameraPreset('earth')}>Earth</button>
              <button className={`pill ${cameraPreset === 'module' ? 'active' : ''}`} onClick={() => setCameraPreset('module')}>Module</button>
            </div>
          </div>
          <div className="hud-card">
            <div className="hud-title">Mission Director</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`pill ${isAutoDemo ? 'active' : ''}`} style={{ width: '100%' }} onClick={startMissionDirectorDemo}>
                {isAutoDemo ? 'Running Demo...' : 'Start Demo'}
              </button>
              <button className="pill" onClick={stopMissionDirectorDemo}>
                Stop
              </button>
            </div>
            {demoStepLabel ? (
              <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(232,238,248,0.92)' }}>
                {demoStepLabel}{isAutoDemo ? ` · ${demoTimeLeft}s` : ''}
              </div>
            ) : null}
          </div>

          {position ? (
            <div className="hud-card">
              <div className="hud-title">Telemetry</div>
              <div className="hud-row">
                <span className="hud-key">LAT</span>
                <span className="hud-val">{Number(position.latitude).toFixed(2)}°</span>
              </div>
              <div className="hud-row">
                <span className="hud-key">LON</span>
                <span className="hud-val">{Number(position.longitude).toFixed(2)}°</span>
              </div>
              <div className="hud-row">
                <span className="hud-key">ALT</span>
                <span className="hud-val">{Number(position.altitude_km).toFixed(0)} km</span>
              </div>
            </div>
          ) : null}

          {appMode === 'training' ? (
            <div className="hud-card">
              <div className="hud-title">{texts.guidance}</div>
              <div style={{ fontSize: 12, color: 'rgba(232,238,248,0.92)', lineHeight: 1.35 }}>
                {trainingStep <= 1 ? texts.step1 : trainingStep === 2 ? texts.step2 : texts.step3}
              </div>
            </div>
          ) : null}
        </div>
        <Suspense fallback={<div className="loading">Загрузка 3D...</div>}>
          <Canvas
            camera={{
              position: scaleMode === 'real' ? [0, 0, 120] : [0, 0, 75],
              fov: scaleMode === 'real' ? 45 : 50,
            }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.25
              gl.outputColorSpace = THREE.SRGBColorSpace
            }}
          >
            <Scene 
              modules={modules} 
              orientation={orientation}
              orbitHeightKm={orbitHeight}
              dockingAnim={dockingAnim}
              showEarth={showEarth}
              scaleMode={scaleMode}
              selectedModuleId={selectedModuleId}
              cameraPreset={cameraPreset}
              onDockingDone={async () => {
                if (!dockingAnim?.module) return
                const id = dockingAnim.module.id
                setDockingAnim(null)
                try {
                  await apiSetModuleAttached(id, true)
                  await apiExpand(dockingAnim.module.type)
                  await refreshModules()
                  await refreshAudit()
                  if (appMode === 'training') setTrainingStep(3)
                } catch {
                  // ignore
                } finally {
                  setIsDocking(false)
                }
              }}
              onModuleClick={(module) => {
                setSelectedModuleId(module.id)
                setCameraPreset('module')
              }}
              language={language}
            />
          </Canvas>
        </Suspense>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ - МОДУЛИ */}
      <div className="panel right-panel">
        <div className="panel-header">
          <span className="panel-icon">🔧</span>
          <span className="panel-title">{texts.modules}</span>
        </div>

        <div className="modules-list">
          {modules.map(module => (
            <div key={module.id} className={`module-card ${module.attached ? 'attached' : ''} ${module.visible ? 'visible' : ''}`}>
              <div className="module-icon">
                {module.type === 'power' ? '⚡' : module.type === 'laboratory' ? '🔬' : '📦'}
              </div>
              <div className="module-info">
                <div className="module-name">{language === 'ru' ? module.nameRu : module.name}</div>
                <div className="module-status">{module.attached ? texts.attached : texts.available}</div>
              </div>
              <div className="module-actions">
                <button className="action-btn" onClick={() => toggleModule(module.id)}>
                  {module.visible ? '👁' : '👁‍🗨'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${(modules.filter(m => m.attached).length / modules.length) * 100}%` }}></div>
        </div>

        <button className="primary-btn" onClick={handleDock} disabled={isDocking || !!dockingAnim}>
          + {texts.addModule}
        </button>

        <div className="button-row">
          <button className="secondary-btn" onClick={() => { refreshAudit(); refreshTimeline(); refreshPredict() }}>
            💾 {texts.save}
          </button>
          <button 
            className={`action-btn-large ${isDocking ? 'docking' : ''}`} 
            onClick={handleDock}
            disabled={isDocking}
          >
            {isDocking ? '⏳ Стыковка...' : `🔗 ${texts.docking}`}
          </button>
        </div>

        <div className="status-message">
          <span className="status-icon">⚡</span>
          <span>{texts.ready}</span>
        </div>

        <button className="upload-btn" onClick={refreshModules}>
          📁 {texts.upload}
        </button>

        <div className="audit-log">
          {auditLog.map((log, idx) => (
            <div key={idx} className="log-entry">
              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="log-action">{log.action}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <span className="panel-icon">🕒</span>
            <span className="panel-title">Timeline</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {['all', 'dock', 'predict', 'modules'].map((k) => (
              <button
                key={k}
                className="secondary-btn"
                style={{ padding: '8px 10px', fontSize: 11, opacity: timelineFilter === k ? 1 : 0.65 }}
                onClick={() => setTimelineFilter(k)}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="audit-log" style={{ maxHeight: 180 }}>
            {timeline
              .filter((e) => {
                if (timelineFilter === 'all') return true
                if (timelineFilter === 'dock') return String(e.action || '').includes('dock') || String(e.action || '').includes('expand')
                if (timelineFilter === 'predict') return String(e.action || '').includes('predict')
                if (timelineFilter === 'modules') return String(e.action || '').includes('module') || String(e.action || '').includes('modules')
                return true
              })
              .slice(-24)
              .map((e) => (
                <div
                  key={e.hash}
                  className="log-entry"
                  onClick={() => {
                    if (String(e.action).includes('dock') || String(e.action).includes('expand')) {
                      const candidate = modules.find((m) => !m.attached) || modules[0]
                      if (!candidate) return
                      setCameraPreset('docking')
                      setDockingAnim({ module: { ...candidate, visible: true }, durationMs: 1800 })
                      setIsDocking(true)
                      setTimeout(() => {
                        setDockingAnim(null)
                        setIsDocking(false)
                      }, 1900)
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Replay event"
                >
                  <span className="log-time">{new Date(e.time).toLocaleTimeString()}</span>
                  <span className="log-action">{e.action}</span>
                </div>
              ))}
          </div>
        </div>

        {predict?.points?.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">📈</span>
              <span className="panel-title">Predict</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 140 }}>
              {predict.points.slice(0, 8).map((p) => (
                <div key={p.time} className="log-entry">
                  <span className="log-time">{new Date(p.time).toLocaleTimeString()}</span>
                  <span className="log-action">
                    {Number(p.latitude).toFixed(1)}°, {Number(p.longitude).toFixed(1)}°
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stations?.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🛰</span>
              <span className="panel-title">Stations</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 160 }}>
              {stations.map((s) => (
                <div key={s.id} className="log-entry">
                  <span className="log-time">{language === 'ru' ? s.nameRu : s.name}</span>
                  <span className="log-action">
                    {Number(s.position?.altitude_km ?? 0).toFixed(0)} km
                  </span>
                </div>
              ))}
            </div>
            {link ? (
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(232,238,248,0.9)' }}>
                Link: {link.a.toUpperCase()} ↔ {link.b.toUpperCase()} — {Number(link.distance_km).toFixed(0)} km, {Number(link.delay_ms).toFixed(1)} ms
              </div>
            ) : null}
          </div>
        ) : null}

        {securePacket ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🔐</span>
              <span className="panel-title">Secure Channel</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 120 }}>
              <div className="log-entry">
                <span className="log-time">alg</span>
                <span className="log-action">{securePacket.algorithm}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">sig</span>
                <span className="log-action">{String(securePacket.signature || '').slice(0, 18)}...</span>
              </div>
              <div className="log-entry">
                <span className="log-time">nonce</span>
                <span className="log-action">{securePacket.nonce}</span>
              </div>
            </div>
          </div>
        ) : null}

        {scosPermit?.permit ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🛡</span>
              <span className="panel-title">SCOS Permit</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 100 }}>
              <div className="log-entry">
                <span className="log-time">{scosPermit.permit.action}</span>
                <span className="log-action">{scosPermit.permit.domain}:{scosPermit.permit.port}</span>
              </div>
            </div>
          </div>
        ) : null}

        {aiRecommendation ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🤖</span>
              <span className="panel-title">AI</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 120 }}>
              <div className="log-entry">
                <span className="log-time">rec</span>
                <span className="log-action">{aiRecommendation.recommendation}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">conf</span>
                <span className="log-action">{Number(aiRecommendation.confidence).toFixed(2)}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">risk</span>
                <span className="log-action">{Number(aiRecommendation.risk_score).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {judgeAnalytics?.kpis ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🏁</span>
              <span className="panel-title">Judge KPI</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 140 }}>
              <div className="log-entry">
                <span className="log-time">innovation</span>
                <span className="log-action">{judgeAnalytics.innovation_score}/100</span>
              </div>
              <div className="log-entry">
                <span className="log-time">events</span>
                <span className="log-action">{judgeAnalytics.kpis.total_events}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">integrity</span>
                <span className="log-action">{judgeAnalytics.kpis.integrity_ok ? 'OK' : 'FAIL'}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App