import { useMemo, useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Line, Stats } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'
import { IssStlAssembly, DockingStlCraft } from './IssStlAssembly'
import {
  ISS_EARTH_UNITS,
  sampleOrbitPoints,
  kmToOrbitRadius,
  geoToScene,
} from './issManifest'
import {
  apiAuditLog,
  apiAuditTimeline,
  apiAuditVerify,
  apiDock,
  apiExpand,
  apiGetModules,
  apiGetPosition,
  apiHealth,
  apiAiForecast,
  apiStations,
  apiStationLink,
  apiSecureEncrypt,
  apiScosPermit,
  apiAiRecommendation,
  apiJudgeAnalytics,
  apiSetModuleAttached,
  apiSetModuleVisibility,
} from './api'
import { useToast } from './useToast'
import { OrbitTrack2D } from './OrbitTrack2D'
import { MODULE_SPECS } from './moduleSpecs'

// ========== КОМПОНЕНТ ЗЕМЛИ (текстуры опциональны — без файлов работает запасной вид) ==========
function Earth({ enabled, scaleMode }) {
  const earthRef = useRef()
  /** undefined = загрузка, null = только fallback, object = карты */
  const [maps, setMaps] = useState(undefined)

  const radius = scaleMode === 'real' ? 30 : 18

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()
    const urls = [
      '/textures/earth_atmos_2048.jpg',
      '/textures/earth_lights_2048.png',
      '/textures/earth_normal_2048.jpg',
      '/textures/earth_specular_2048.jpg',
      '/textures/earth_clouds_1024.png',
    ]
    Promise.all(urls.map((u) => loader.loadAsync(u)))
      .then(([dayMap, nightMap, normalMap, specMap, cloudsMap]) => {
        if (cancelled) return
        dayMap.colorSpace = THREE.SRGBColorSpace
        nightMap.colorSpace = THREE.SRGBColorSpace
        cloudsMap.colorSpace = THREE.SRGBColorSpace
        setMaps({ dayMap, nightMap, normalMap, specMap, cloudsMap })
      })
      .catch(() => {
        if (!cancelled) setMaps(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const earthShader = useMemo(() => {
    if (!maps) return null
    const { dayMap, nightMap } = maps
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
          dayCol *= 0.98;
          nightCol = pow(nightCol, vec3(1.0/1.6)) * 1.6;
          vec3 col = mix(nightCol, dayCol, k);
          float tw = smoothstep(-0.25, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.22, ndl));
          col += vec3(0.9, 0.35, 0.15) * tw * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }
  }, [maps])

  useFrame((state, delta) => {
    if (enabled && earthRef.current) {
      earthRef.current.rotation.y += delta * 0.02
    }
  })

  if (!enabled) return null

  if (maps === undefined) {
    return (
      <group ref={earthRef}>
        <mesh>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshStandardMaterial color="#1a3d5c" metalness={0.15} roughness={0.85} emissive="#061525" emissiveIntensity={0.35} />
        </mesh>
      </group>
    )
  }

  if (maps === null || !earthShader) {
    return (
      <group ref={earthRef}>
        <mesh>
          <sphereGeometry args={[radius, 64, 64]} />
          <meshStandardMaterial color="#1e4a6e" metalness={0.2} roughness={0.75} emissive="#0a2840" emissiveIntensity={0.4} />
        </mesh>
        <mesh scale={[1.02, 1.02, 1.02]}>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshStandardMaterial transparent opacity={0.35} color="#58c7ff" depthWrite={false} />
        </mesh>
      </group>
    )
  }

  const { normalMap, specMap, cloudsMap } = maps

  return (
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial attach="material" args={[earthShader]} />
      </mesh>
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
      <mesh scale={[1.01, 1.01, 1.01]}>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial map={cloudsMap || null} transparent opacity={0.35} depthWrite={false} />
      </mesh>
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

/** Зелёные «пакеты» данных, бегущие по линии связи */
function LinkDataPulses({ fromVec, toVec, count = 4, speed = 0.55, color = '#39ff8a' }) {
  const a = useRef(new THREE.Vector3())
  const b = useRef(new THREE.Vector3())
  const meshRefs = useRef([])

  useFrame((state) => {
    a.current.copy(fromVec)
    b.current.copy(toVec)
    const t0 = state.clock.elapsedTime * speed
    for (let i = 0; i < count; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      const t = (t0 + i / count) % 1
      mesh.position.lerpVectors(a.current, b.current, t)
    }
  })

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el }}>
          <sphereGeometry args={[0.2, 10, 10]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function DockingAnimatedModule({ from, to, durationMs, onDone }) {
  const groupRef = useRef()
  const startRef = useRef(null)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

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
      const cb = onDoneRef.current
      if (cb) cb()
    }
  })

  return (
    <group ref={groupRef}>
      <DockingStlCraft position={[0, 0, 0]} rotation={[0, 0, 0]} />
    </group>
  )
}

// ========== 3D СЦЕНА ==========
function Scene({
  modules,
  moduleColors,
  orientation,
  orbitHeightKm,
  inclinationDeg,
  orbitTimeScale,
  panelAngleDeg,
  dockingAnim,
  onDockingDone,
  showEarth,
  scaleMode,
  cameraPreset,
  showOrbitPath,
  showIssLinks,
  stations,
  linkPair,
  freezeOrbit,
  issFocusMode,
  explodedFactor = 0,       // ← ДОБАВЛЕНО
  xrayMode = false,         // ← ДОБАВЛЕНО
  onModuleClick,            // ← ДОБАВЛЕНО
  onModuleHover, 
  selectedModule,
}) {
  const orbitRef = useRef()
  const stationRef = useRef()
  const controlsRef = useRef()
  const issPos = useRef(new THREE.Vector3(0, 0, 42))
  const orbitAngleRef = useRef(0)
  const lastPresetRef = useRef(cameraPreset)
  const presetJustChangedRef = useRef(true)
  const prevIssFocusRef = useRef(issFocusMode)
  const { camera } = useThree()

  const earthRadius = scaleMode === 'real' ? ISS_EARTH_UNITS.realEarthRadius : ISS_EARTH_UNITS.demoEarthRadius
  const orbitR = useMemo(() => kmToOrbitRadius(orbitHeightKm, earthRadius), [orbitHeightKm, earthRadius])

  const orbitPoints = useMemo(() => sampleOrbitPoints(orbitR, inclinationDeg, 180), [orbitR, inclinationDeg])

  const visibleGroupKeys = useMemo(() => {
    const rows = (modules || []).filter((m) => m && m.visible && m.attached && m.stlGroup)
    return rows.map((m) => m.stlGroup)
  }, [modules])

  const hiddenStlGroups = useMemo(() => {
    if (dockingAnim) return new Set(['MRM2'])
    return undefined
  }, [dockingAnim])

  const [issCommLinks, setIssCommLinks] = useState([])
  const linkAcc = useRef(0)

  useFrame((state, delta) => {
    if (!dockingAnim && !freezeOrbit) {
      const periodSec = 92.68 * 60
      orbitAngleRef.current += delta * orbitTimeScale * ((2 * Math.PI) / periodSec)
    }
    const th = orbitAngleRef.current
    const inc = (inclinationDeg * Math.PI) / 180
    const x = orbitR * Math.cos(th)
    const y = orbitR * Math.sin(th) * Math.sin(inc)
    const z = orbitR * Math.sin(th) * Math.cos(inc)

    if (orbitRef.current) {
      orbitRef.current.position.set(x, y, z)
    }
    issPos.current.set(x, y, z)

    if (stationRef.current) {
      stationRef.current.rotation.x = THREE.MathUtils.lerp(
        stationRef.current.rotation.x,
        (orientation.x * Math.PI) / 180,
        delta * 2,
      )
      stationRef.current.rotation.y = THREE.MathUtils.lerp(
        stationRef.current.rotation.y,
        (orientation.y * Math.PI) / 180,
        delta * 2,
      )
      stationRef.current.rotation.z = THREE.MathUtils.lerp(
        stationRef.current.rotation.z,
        (orientation.z * Math.PI) / 180,
        delta * 2,
      )
    }

    const presets = {
      overview: [0, 0, scaleMode === 'real' ? 95 : 58],
      docking: [20, 14, 42],
      earth: [-32, 52, scaleMode === 'real' ? 110 : 78],
      module: [16, 12, 36],
    }
    const ctrl = controlsRef.current
    if (ctrl) {
      if (prevIssFocusRef.current !== issFocusMode) {
        prevIssFocusRef.current = issFocusMode
        presetJustChangedRef.current = true
      }
      if (lastPresetRef.current !== cameraPreset) {
        lastPresetRef.current = cameraPreset
        presetJustChangedRef.current = true
      }
      const off = new THREE.Vector3(...(presets[cameraPreset] || presets.overview))
      if (issFocusMode) {
        off.set(12, 10, 22)
      }
      if (presetJustChangedRef.current) {
        ctrl.target.copy(issPos.current)
        camera.position.copy(issPos.current).add(off)
        ctrl.update()
        presetJustChangedRef.current = false
      } else if (!issFocusMode) {
        ctrl.target.lerp(issPos.current, Math.min(1, delta * 2.2))
        ctrl.update()
      }
    }

    if (!showIssLinks) {
      setIssCommLinks((prev) => (prev.length ? [] : prev))
    } else if (stations?.length) {
      linkAcc.current += delta
      if (linkAcc.current > 0.22) {
        linkAcc.current = 0
        const o = issPos.current.clone()
        const next = []
        for (const s of stations) {
          const p = s.position
          if (!p || p.latitude == null) continue
          next.push({
            key: s.id,
            a: o.clone(),
            b: geoToScene(p.latitude, p.longitude, p.altitude_km ?? 408, earthRadius),
          })
        }
        setIssCommLinks(next)
      }
    }
  })

  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight intensity={0.75} color={'#cfe8ff'} groundColor={'#1b2a45'} />
      <directionalLight position={[12, 8, 18]} intensity={1.35} color={'#ffffff'} />
      <pointLight position={[-8, -5, 10]} intensity={0.65} color={'#7b5cff'} />
      <Stars radius={120} depth={60} count={6000} factor={4} saturation={0} fade speed={1} />
      <Earth enabled={showEarth} scaleMode={scaleMode} />

      {showOrbitPath ? (
        <Line points={orbitPoints} color="#2ad4ff" lineWidth={1.2} transparent opacity={0.55} />
      ) : null}

      <group ref={orbitRef}>
        <group ref={stationRef}>
          <IssStlAssembly
            visibleGroupKeys={visibleGroupKeys}
            panelAngleDeg={panelAngleDeg}
            hiddenGroups={hiddenStlGroups}
            moduleColors={moduleColors}
            explodedFactor={explodedFactor}   // ← ДОБАВЛЕНО
            xrayMode={xrayMode}               // ← ДОБАВЛЕНО
            onModuleClick={onModuleClick}     // ← ДОБАВЛЕНО
            onModuleHover={onModuleHover}     // ← ДОБАВЛЕНО
            selectedModule={selectedModule}
          />
        </group>

        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[2.2, 0.09, 10, 48]} />
          <meshStandardMaterial color={'#00d4ff'} emissive={'#00d4ff'} emissiveIntensity={0.75} />
        </mesh>

        {dockingAnim ? (
          <DockingAnimatedModule
            key={`dock-${dockingAnim.module?.id ?? 'x'}-${dockingAnim.durationMs}`}
            from={[9, 5, 46]}
            to={[0, 0.2, 0]}
            durationMs={dockingAnim.durationMs}
            onDone={onDockingDone}
          />
        ) : null}
      </group>

      {showIssLinks &&
        issCommLinks.map((ln) => (
          <group key={ln.key}>
            <Line points={[ln.a, ln.b]} color="#4ade80" lineWidth={1.4} transparent opacity={0.55} />
            <LinkDataPulses fromVec={ln.a} toVec={ln.b} count={5} speed={0.5} color="#5cff9a" />
          </group>
        ))}

      {linkPair?.aPos && linkPair?.bPos ? (
        <group>
          <Line
            points={[linkPair.aPos, linkPair.bPos]}
            color="#ffd447"
            lineWidth={2}
            transparent
            opacity={0.95}
          />
          <LinkDataPulses fromVec={linkPair.aPos} toVec={linkPair.bPos} count={4} speed={0.42} color="#3dff7a" />
        </group>
      ) : null}

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        enableDamping
        dampingFactor={0.08}
        minDistance={issFocusMode ? 2.5 : 8}
        maxDistance={issFocusMode ? 140 : 380}
      />
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
  const [issAiForecast, setIssAiForecast] = useState(null)
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
  const exitIssDetailViewRef = useRef(() => {})
  const [apiStatus, setApiStatus] = useState({ ok: false, message: '...' })
  const [position, setPosition] = useState(null)
  const [dockingAnim, setDockingAnim] = useState(null)
  const [scaleMode, setScaleMode] = useState('demo') // 'demo' | 'real'
  const [showEarth, setShowEarth] = useState(true)
  const [appMode, setAppMode] = useState('twin') // 'twin' | 'training' | 'presentation'
  const [trainingStep, setTrainingStep] = useState(0)
  const [cameraPreset, setCameraPreset] = useState('overview')
  const [orbitTimeScale, setOrbitTimeScale] = useState(120)
  const [showOrbitPath, setShowOrbitPath] = useState(true)
  const [showIssLinks, setShowIssLinks] = useState(true)
  const [issDetailView, setIssDetailView] = useState(false)
  const savedOrbitHudRef = useRef(null)
  const prevAppModeRef = useRef(appMode)
  const savedOrbitTimeScaleRef = useRef(null)

  const [modules, setModules] = useState([])
  const [exploded, setExploded] = useState(false)
  const [hoveredModule, setHoveredModule] = useState(null)
  const [selectedModule, setSelectedModule] = useState(null)
  const [xrayMode, setXrayMode] = useState(false)
  const handleModuleClick = (group) => {
  setSelectedModule(prev => prev === group ? null : group)
}

  const { toast, showToast, dismiss } = useToast(4500)
  // Карта цветов для 3D моделей (ТЗ п.3.2)
  const moduleColors = {
    laboratory: '#ffffff',
    nodal: '#d4af37',
    power: '#0f172a',
    base: '#9ca3af'
}

  const totalMassKg = useMemo(() => {
    return modules.reduce((s, m) => s + (Number(m.mass_kg) || 0), 0)
  }, [modules])

  const linkPair = useMemo(() => {
    if (!link || !stations?.length) return null
    const a = stations.find((s) => s.id === link.a)
    const b = stations.find((s) => s.id === link.b)
    if (!a?.position || a.position.latitude == null || !b?.position || b.position.latitude == null) return null
    const er = scaleMode === 'real' ? ISS_EARTH_UNITS.realEarthRadius : ISS_EARTH_UNITS.demoEarthRadius
    return {
      aPos: geoToScene(a.position.latitude, a.position.longitude, a.position.altitude_km ?? 408, er),
      bPos: geoToScene(b.position.latitude, b.position.longitude, b.position.altitude_km ?? 408, er),
    }
  }, [link, stations, scaleMode])

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
      const data = await apiAiForecast(6, 30)
      setPredict({
        points: data.points,
        source: data.source,
        hours: data.hours,
        step_min: data.step_min,
      })
      setIssAiForecast(data.ai ?? null)
    } catch {
      setPredict(null)
      setIssAiForecast(null)
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

  const canDock = useMemo(() => modules.some((m) => m && !m.attached), [modules])

  const enterIssDetailView = useCallback(() => {
    setIssDetailView((prev) => {
      if (prev) return prev
      savedOrbitHudRef.current = {
        earth: showEarth,
        path: showOrbitPath,
        links: showIssLinks,
      }
      setCameraPreset('docking')
      return true
    })
  }, [showEarth, showOrbitPath, showIssLinks])

  const exitIssDetailView = useCallback(() => {
    setIssDetailView((prev) => {
      if (!prev) return prev
      const s = savedOrbitHudRef.current
      if (s) {
        setShowEarth(s.earth)
        setShowOrbitPath(s.path)
        setShowIssLinks(s.links)
      }
      setCameraPreset('overview')
      return false
    })
  }, [])

  exitIssDetailViewRef.current = exitIssDetailView

  const exportSnapshot = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 'iss-dt-mvp-1',
      orbit: {
        heightKm: orbitHeight,
        inclinationDeg: inclination,
        orientationDeg: orientation,
        panelAngleDeg: panelAngle,
        orbitTimeScale,
        scaleMode,
      },
      modules: modules.map((m) => ({
        id: m.id,
        name: m.name,
        nameRu: m.nameRu,
        type: m.type,
        moduleType: m.moduleType,
        stlGroup: m.stlGroup,
        attached: m.attached,
        visible: m.visible,
        mass_kg: m.mass_kg,
        position: m.position,
      })),
      telemetry: position,
      predictMeta: predict ? { source: predict.source, hours: predict.hours } : null,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `iss-twin-snapshot-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast(language === 'ru' ? 'Снимок конфигурации сохранён (JSON)' : 'Configuration snapshot saved (JSON)', 'ok')
  }, [
    orbitHeight,
    inclination,
    orientation,
    panelAngle,
    orbitTimeScale,
    scaleMode,
    modules,
    position,
    predict,
    showToast,
    language,
  ])

  const runAuditVerify = useCallback(async () => {
    try {
      const v = await apiAuditVerify()
      const ok = v?.valid === true
      showToast(
        ok
          ? language === 'ru'
            ? `Цепочка аудита OK (${v.records ?? 0} записей)`
            : `Audit chain OK (${v.records ?? 0} records)`
          : language === 'ru'
            ? 'Цепочка аудита: ошибка целостности'
            : 'Audit chain integrity failed',
        ok ? 'ok' : 'warn',
      )
    } catch (e) {
      showToast(
        language === 'ru' ? `Проверка аудита: ${e?.message || 'ошибка'}` : `Audit verify: ${e?.message || 'error'}`,
        'err',
      )
    }
  }, [showToast, language])

  const handleDock = useCallback(() => {
    if (isDocking || dockingAnim) return

    const availableModule = modules.find((m) => !m.attached)
    if (availableModule) {
      setIsDocking(true)
      dockingCompletionGuard.current = false
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
      return
    }

    const candidate = modules.find((m) => m.stlGroup === 'MRM2') || modules[0]
    if (!candidate) {
      showToast(language === 'ru' ? 'Нет загруженных модулей' : 'No modules loaded', 'warn')
      return
    }

    setIsDocking(true)
    dockingCompletionGuard.current = false
    setDockingAnim({
      module: { ...candidate, visible: true },
      durationMs: 2400,
      replayOnly: true,
    })
    showToast(
      language === 'ru' ? 'Демонстрация сближения и стыковки' : 'Docking approach replay',
      'info',
    )
  }, [isDocking, dockingAnim, modules, refreshAudit, refreshTimeline, showToast, language])

  const handleDockRef = useRef(handleDock)
  handleDockRef.current = handleDock

  const dockingCompletionGuard = useRef(false)

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
      orbitSpeed: 'Скорость орбиты (×)',
      showOrbitPath: 'Траектория орбиты',
      showIssLinks: 'Межспутниковая связь (линии)',
      dockUnavailable: 'Все модули в составе — снова нажмите для демонстрации стыковки',
      dockReadyHint: 'Стыковка модуля или повтор анимации',
      dockReplay: 'Повтор демонстрации стыковки',
      viewToggle: 'Вид: МКС / орбита',
      viewIssDetail: 'МКС (стыковка)',
      viewOrbit: 'Орбита и связь',
      camera: 'Камера',
      camOverview: 'Обзор',
      camDocking: 'Стыковка',
      camEarth: 'Земля',
      camModule: 'Модуль',
      missionDirector: 'Директор миссии',
      startDemo: 'Старт демо',
      demoRunning: 'Демо выполняется…',
      stop: 'Стоп',
      telemetry: 'Телеметрия',
      timeline: 'Хронология',
      predict: 'Прогноз',
      stations: 'Станции',
      secureChannel: 'Защищённый канал',
      scosPermit: 'Допуск SCOS',
      judgeKpi: 'Судья KPI',
      aiTitle: 'ИИ',
      loading3d: 'Загрузка 3D…',
      presentationBanner: 'Режим презентации — акцент на сцене',
      trainingBanner: 'Режим тренажёра — подсказки и спокойная орбита',
      demoInit: 'Запуск режима презентации',
      demoScale: 'Реальный масштаб',
      demoEarth: 'Контекст Земли',
      demoCamEarth: 'Облёт: камера Земля',
      demoCamDock: 'Камера: стыковка',
      demoDockRun: 'Стыковочная последовательность',
      demoPredict: 'Обновление прогноза трека',
      demoStations: 'Межстанционные связи',
      demoSecure: 'Защищённый пакет телеметрии',
      demoScos: 'Выдача допуска SCOS',
      demoJudge: 'Расчёт KPI судьи',
      demoDone: 'Демо завершено',
      exportSnapshot: 'Экспорт JSON',
      verifyAudit: 'Проверить аудит',
      totalMass: 'Суммарная масса',
      dockSuccess: 'Стыковка завершена',
      modulesRefreshed: 'Состав модулей обновлён',
      modulesRefreshErr: 'Не удалось обновить модули',
      saveSynced: 'Данные сохранены и обновлены',
      saveSyncErr: 'Ошибка при обновлении',
      timelineFilterAll: 'Все',
      timelineFilterDock: 'Стык',
      timelineFilterPredict: 'Трек',
      timelineFilterModules: 'Модули',
      linkLabel: 'Связь',
      closeToast: 'Закрыть',
      replayTimelineHint: 'Повторить событие (стыковка)',
      secureAlg: 'Алгоритм',
      secureSig: 'Подпись',
      secureNonce: 'Одноразовый код',
      kpisInnovation: 'Инновации',
      kpisEvents: 'События',
      kpisIntegrity: 'Целостность',
      integrityOk: 'ОК',
      integrityFail: 'Ошибка',
      aiRec: 'Рекомендация',
      aiConf: 'Уверенность',
      aiRisk: 'Риск',
      aiForecastTitle: 'Прогноз МКС (AI)',
      aiForecastConfidence: 'Уверенность модели',
      aiForecastModel: 'Модель',
      aiForecastFactors: 'Факторы',
      aiForecastHighlights: 'Ключевые метрики',
      envOn: 'Вкл',
      envOff: 'Выкл',
      altUnitKm: 'км',
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
      orbitSpeed: 'Orbit speed (×)',
      showOrbitPath: 'Orbit trajectory',
      showIssLinks: 'Inter-satellite links (lines)',
      dockUnavailable: 'All modules attached — press again for docking replay',
      dockReadyHint: 'Dock a module or replay animation',
      dockReplay: 'Docking replay',
      viewToggle: 'View: ISS / orbit',
      viewIssDetail: 'ISS (docking)',
      viewOrbit: 'Orbit & comms',
      camera: 'Camera',
      camOverview: 'Overview',
      camDocking: 'Docking',
      camEarth: 'Earth',
      camModule: 'Module',
      missionDirector: 'Mission Director',
      startDemo: 'Start demo',
      demoRunning: 'Running demo…',
      stop: 'Stop',
      telemetry: 'Telemetry',
      timeline: 'Timeline',
      predict: 'Predict',
      stations: 'Stations',
      secureChannel: 'Secure channel',
      scosPermit: 'SCOS permit',
      judgeKpi: 'Judge KPI',
      aiTitle: 'AI',
      loading3d: 'Loading 3D…',
      presentationBanner: 'Presentation mode — focus on the scene',
      trainingBanner: 'Training mode — hints and slower orbit',
      demoInit: 'Initialize presentation mode',
      demoScale: 'Switch to real scale',
      demoEarth: 'Enable Earth context',
      demoCamEarth: 'Earth camera pass',
      demoCamDock: 'Docking camera setup',
      demoDockRun: 'Run docking sequence',
      demoPredict: 'Update trajectory forecast',
      demoStations: 'Update inter-station links',
      demoSecure: 'Send secure telemetry packet',
      demoScos: 'Issue SCOS permit',
      demoJudge: 'Compute judge KPI score',
      demoDone: 'Demo complete',
      exportSnapshot: 'Export JSON',
      verifyAudit: 'Verify audit',
      totalMass: 'Total mass',
      dockSuccess: 'Docking complete',
      modulesRefreshed: 'Module list updated',
      modulesRefreshErr: 'Could not refresh modules',
      saveSynced: 'Data saved and refreshed',
      saveSyncErr: 'Refresh failed',
      timelineFilterAll: 'All',
      timelineFilterDock: 'Dock',
      timelineFilterPredict: 'Track',
      timelineFilterModules: 'Modules',
      linkLabel: 'Link',
      closeToast: 'Close',
      replayTimelineHint: 'Replay docking event',
      secureAlg: 'Algorithm',
      secureSig: 'Signature',
      secureNonce: 'Nonce',
      kpisInnovation: 'Innovation',
      kpisEvents: 'Events',
      kpisIntegrity: 'Integrity',
      integrityOk: 'OK',
      integrityFail: 'FAIL',
      aiRec: 'Recommendation',
      aiConf: 'Confidence',
      aiRisk: 'Risk',
      aiForecastTitle: 'ISS forecast (AI)',
      aiForecastConfidence: 'Model confidence',
      aiForecastModel: 'Model',
      aiForecastFactors: 'Factors',
      aiForecastHighlights: 'Key metrics',
      envOn: 'On',
      envOff: 'Off',
      altUnitKm: 'km',
    }
  }

  const texts = t[language]

  const handleRefreshModules = useCallback(
    async () => {
      const tx = t[language]
      try {
        await refreshModules()
        showToast(tx.modulesRefreshed, 'ok')
      } catch (e) {
        showToast(`${tx.modulesRefreshErr}: ${e?.message || ''}`.trim(), 'err')
      }
    },
    // t is a fresh object each render but locale strings are stable for a given `language`
    [refreshModules, showToast, language], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleSaveSync = useCallback(
    async () => {
      const tx = t[language]
      try {
        await Promise.all([refreshAudit(), refreshTimeline(), refreshPredict()])
        showToast(tx.saveSynced, 'ok')
      } catch (e) {
        showToast(`${tx.saveSyncErr}: ${e?.message || ''}`.trim(), 'err')
      }
    },
    [refreshAudit, refreshTimeline, refreshPredict, showToast, language], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (appMode !== 'training') return
    setTrainingStep(1)
  }, [appMode])

  useEffect(() => {
    const prev = prevAppModeRef.current
    prevAppModeRef.current = appMode
    if (appMode === 'training' && prev !== 'training') {
      savedOrbitTimeScaleRef.current = orbitTimeScale
      setOrbitTimeScale((s) => Math.min(s, 28))
    } else if (prev === 'training' && appMode !== 'training') {
      const v = savedOrbitTimeScaleRef.current
      if (v != null) setOrbitTimeScale(v)
      savedOrbitTimeScaleRef.current = null
    }
  }, [appMode, orbitTimeScale])

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
    for (const item of demoTimersRef.current) {
      if (item.kind === 'interval') clearInterval(item.id)
      else clearTimeout(item.id)
    }
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
    const tx = t[language]
    clearDemoTimers()
    const totalMs = 16500
    const startedAt = Date.now()

    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((totalMs - (Date.now() - startedAt)) / 1000))
      setDemoTimeLeft(left)
      if (left <= 0) clearInterval(tick)
    }, 250)
    demoTimersRef.current.push({ kind: 'interval', id: tick })

    setIsAutoDemo(true)
    setAppMode('presentation')
    exitIssDetailViewRef.current()
    setDemoStepLabel(tx.demoInit)
    setCameraPreset('overview')
    const pushT = (fn, ms) => {
      demoTimersRef.current.push({ kind: 'timeout', id: setTimeout(fn, ms) })
    }
    pushT(() => {
      setDemoStepLabel(tx.demoScale)
      setScaleMode('real')
    }, 1200)
    pushT(() => {
      setDemoStepLabel(tx.demoEarth)
      setShowEarth(true)
    }, 2200)
    pushT(() => {
      setDemoStepLabel(tx.demoCamEarth)
      setCameraPreset('earth')
    }, 3500)
    pushT(() => {
      setDemoStepLabel(tx.demoCamDock)
      setCameraPreset('docking')
    }, 5200)
    pushT(() => {
      setDemoStepLabel(tx.demoDockRun)
      handleDockRef.current?.()
    }, 6500)
    pushT(() => {
      setDemoStepLabel(tx.demoPredict)
      refreshPredict()
    }, 9000)
    pushT(() => {
      setDemoStepLabel(tx.demoStations)
      refreshStations()
    }, 10200)
    pushT(() => {
      setDemoStepLabel(tx.demoSecure)
      refreshSecurePacket()
    }, 11400)
    pushT(() => {
      setDemoStepLabel(tx.demoScos)
      refreshScosPermit()
    }, 12600)
    pushT(() => {
      setDemoStepLabel(tx.demoJudge)
      refreshJudge()
    }, 13800)
    pushT(() => {
      setDemoStepLabel(tx.demoDone)
      setCameraPreset('overview')
      setIsAutoDemo(false)
      demoTimersRef.current.push({
        kind: 'timeout',
        id: setTimeout(() => {
          setDemoStepLabel('')
          setDemoTimeLeft(0)
        }, 1200),
      })
    }, 16500)
  }

  useEffect(() => {
    return () => clearDemoTimers()
  }, [])

  const earthInScene = showEarth && !issDetailView
  const orbitPathInScene = showOrbitPath && !issDetailView
  const linksInScene = showIssLinks && !issDetailView

  return (
    <div
      className={[
        'app-container',
        appMode === 'presentation' ? 'app-container--presentation' : '',
        appMode === 'training' ? 'app-container--training' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {toast ? (
        <div className={`app-toast app-toast--${toast.kind}`} role="status">
          <span>{toast.message}</span>
          <button type="button" className="app-toast-close" onClick={dismiss} aria-label={texts.closeToast}>
            ×
          </button>
        </div>
      ) : null}

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
            <span className="label-value">
              {orbitHeight} {texts.altUnitKm}
            </span>
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

        <div className="control-group">
          <div className="control-label">
            <span className="label-icon">⏱</span>
            <span>{texts.orbitSpeed}</span>
            <span className="label-value">{orbitTimeScale}×</span>
          </div>
          <input
            type="range"
            min="1"
            max="400"
            value={orbitTimeScale}
            onChange={(e) => setOrbitTimeScale(Number(e.target.value))}
            className="slider"
          />
        </div>

        <div className="control-group" style={{ marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(232,238,248,0.85)' }}>
            <input type="checkbox" checked={showOrbitPath} onChange={(e) => setShowOrbitPath(e.target.checked)} />
            {texts.showOrbitPath}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(232,238,248,0.85)', marginTop: 8 }}>
            <input type="checkbox" checked={showIssLinks} onChange={(e) => setShowIssLinks(e.target.checked)} />
            {texts.showIssLinks}
          </label>
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
              <span className="label-value">
                {Number(position.altitude_km).toFixed(0)} {texts.altUnitKm}
              </span>
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
              type="button"
              className="secondary-btn"
              onClick={() => setScaleMode('demo')}
              style={{ opacity: scaleMode === 'demo' ? 1 : 0.65 }}
            >
              {texts.scaleDemo}
            </button>
            <button
              type="button"
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
            <span className="label-value">{showEarth ? texts.envOn : texts.envOff}</span>
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
        <div
          className="language-toggle"
          onClick={toggleLanguage}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleLanguage()
            }
          }}
        >
          {texts.language}
        </div>
        {appMode === 'presentation' ? (
          <div className="main-view-banner main-view-banner--presentation">{texts.presentationBanner}</div>
        ) : null}
        {appMode === 'training' ? <div className="main-view-banner main-view-banner--training">{texts.trainingBanner}</div> : null}
        <div className="hud">
          <div className="hud-card">
            <div className="hud-title">{texts.mode}</div>
            <div className="mode-pills">
              <button type="button" className={`pill ${appMode === 'twin' ? 'active' : ''}`} onClick={() => setAppMode('twin')}>
                {texts.modeTwin}
              </button>
              <button type="button" className={`pill ${appMode === 'training' ? 'active' : ''}`} onClick={() => setAppMode('training')}>
                {texts.modeTraining}
              </button>
              <button type="button" className={`pill ${appMode === 'presentation' ? 'active' : ''}`} onClick={() => setAppMode('presentation')}>
                {texts.modePresentation}
              </button>
            </div>
          </div>
          <div className="hud-card">
            <div className="hud-title">{texts.viewToggle}</div>
            <div className="mode-pills" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className={`pill ${!issDetailView ? 'active' : ''}`} onClick={exitIssDetailView}>
                {texts.viewOrbit}
              </button>
              <button type="button" className={`pill ${issDetailView ? 'active' : ''}`} onClick={enterIssDetailView}>
                {texts.viewIssDetail}
              </button>
            </div>
          </div>
          <div className="hud-card">
            <div className="hud-title">{texts.camera}</div>
            <div className="mode-pills" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className={`pill ${cameraPreset === 'overview' ? 'active' : ''}`} onClick={() => setCameraPreset('overview')}>
                {texts.camOverview}
              </button>
              <button type="button" className={`pill ${cameraPreset === 'docking' ? 'active' : ''}`} onClick={() => setCameraPreset('docking')}>
                {texts.camDocking}
              </button>
              <button type="button" className={`pill ${cameraPreset === 'earth' ? 'active' : ''}`} onClick={() => setCameraPreset('earth')}>
                {texts.camEarth}
              </button>
              <button type="button" className={`pill ${cameraPreset === 'module' ? 'active' : ''}`} onClick={() => setCameraPreset('module')}>
                {texts.camModule}
              </button>
            </div>
          </div>
          <div className="hud-card">
            <div className="hud-title">{texts.missionDirector}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`pill pill--demo ${isAutoDemo ? 'active' : ''}`}
                style={{ width: '100%' }}
                aria-pressed={isAutoDemo}
                onClick={startMissionDirectorDemo}
                disabled={isAutoDemo}
              >
                {isAutoDemo ? texts.demoRunning : texts.startDemo}
              </button>
              <button type="button" className="pill" onClick={stopMissionDirectorDemo}>
                {texts.stop}
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
              <div className="hud-title">{texts.telemetry}</div>
              <div className="hud-row">
                <span className="hud-key">{texts.lat}</span>
                <span className="hud-val">{Number(position.latitude).toFixed(2)}°</span>
              </div>
              <div className="hud-row">
                <span className="hud-key">{texts.lon}</span>
                <span className="hud-val">{Number(position.longitude).toFixed(2)}°</span>
              </div>
              <div className="hud-row">
                <span className="hud-key">{texts.alt}</span>
                <span className="hud-val">
                  {Number(position.altitude_km).toFixed(0)} {texts.altUnitKm}
                </span>
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
        <Suspense fallback={<div className="loading">{texts.loading3d}</div>}>
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
            <Stats />
            l<Scene
              modules={modules}
              modueColors={moduleColors}
              orientation={orientation}
              orbitHeightKm={orbitHeight}
              inclinationDeg={inclination}
              orbitTimeScale={orbitTimeScale}
              panelAngleDeg={panelAngle}
              dockingAnim={dockingAnim}
              showEarth={earthInScene}
              scaleMode={scaleMode}
              cameraPreset={cameraPreset}
              showOrbitPath={orbitPathInScene}
              showIssLinks={linksInScene}
              freezeOrbit={issDetailView}
              issFocusMode={issDetailView}
              stations={stations}
              linkPair={issDetailView ? null : linkPair}
              explodedFactor={exploded ? 1 : 0}
              xrayMode={xrayMode}
              onModuleClick={(group) => setSelectedModule(prev => prev === group ? null : group)}
              selectedModule={selectedModule}
              onModuleHover={setHoveredModule}
              onDockingDone={async () => {
                if (dockingAnim?.replayOnly) {
                  setDockingAnim(null)
                  setIsDocking(false)
                  return
                }
                if (dockingCompletionGuard.current) return
                const mod = dockingAnim?.module
                if (!mod) return
                dockingCompletionGuard.current = true
                const id = mod.id
                const modType = mod.type
                setDockingAnim(null)
                try {
                  await apiSetModuleAttached(id, true)
                  await apiExpand(modType)
                  await refreshModules()
                  await refreshAudit()
                  showToast(language === 'ru' ? `${texts.dockSuccess}: ${mod.nameRu || mod.name}` : `${texts.dockSuccess}: ${mod.name}`, 'ok')
                  if (appMode === 'training') setTrainingStep(3)
                } catch {
                  // ignore
                } finally {
                  setIsDocking(false)
                }
              }}
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
  <div key={module.id} className={`module-card ${module.attached ? 'attached' : ''} ${module.visible ? 'visible' : ''}`} >
    <div className="module-icon" title={module.moduleType}>
      {module.moduleType === 'laboratory' ? '🔬' : 
       module.moduleType === 'nodal' ? '🔗' : 
       module.moduleType === 'power' ? '⚡' : '🛰'}
    </div>
    <div className="module-info">
      <div className="module-name">{language === 'ru' ? module.nameRu : module.name}</div>
      <div className="module-status">{module.attached ? texts.attached : texts.available}</div>
      {/* БЕЙДЖ ТИПА МОДУЛЯ */}
      {module.moduleType && (
        <div style={{
          fontSize: 9,
          padding: '2px 5px',
          borderRadius: 3,
          fontWeight: 600,
          marginTop: 4,
          display: 'inline-block',
          background: module.moduleType === 'laboratory' ? '#3b82f622' : 
                      module.moduleType === 'nodal' ? '#f59e0b22' : 
                      module.moduleType === 'power' ? '#10b98122' : '#8b5cf622',
          color: module.moduleType === 'laboratory' ? '#60a5fa' : 
                 module.moduleType === 'nodal' ? '#fbbf24' : 
                 module.moduleType === 'power' ? '#34d399' : '#a78bfa',
          border: `1px solid ${
            module.moduleType === 'laboratory' ? '#3b82f644' : 
            module.moduleType === 'nodal' ? '#f59e0b44' : 
            module.moduleType === 'power' ? '#10b98144' : '#8b5cf644'
          }`
        }}>
          {module.moduleType === 'laboratory' ? (language === 'ru' ? 'ЛАБ' : 'LAB') : 
           module.moduleType === 'nodal' ? (language === 'ru' ? 'УЗЕЛ' : 'NODE') : 
           module.moduleType === 'power' ? (language === 'ru' ? 'ЭНЕРГО' : 'PWR') : (language === 'ru' ? 'БАЗА' : 'CORE')}
        </div>
      )}
    </div>
    <div className="module-actions">
      <button type="button" className="action-btn" onClick={() => toggleModule(module.id)}>
        {module.visible ? '👁' : '👁‍🗨'}
      </button>
    </div>
  </div>
))}
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{
              width: `${(modules.filter((m) => m.attached).length / Math.max(1, modules.length)) * 100}%`,
            }}
          />
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={handleDock}
          disabled={isDocking || !!dockingAnim}
          title={texts.dockReadyHint}
        >
          + {texts.addModule}
        </button>

        <div className="button-row">
          <button
            type="button"
            className="secondary-btn"
            onClick={handleSaveSync}
          >
            💾 {texts.save}
          </button>
          <button
            type="button"
            className={`action-btn-large ${isDocking ? 'docking' : ''}`}
            onClick={handleDock}
            disabled={isDocking || !!dockingAnim}
            title={texts.dockReadyHint}
          >
            {isDocking ? `⏳ ${language === 'ru' ? 'Стыковка…' : 'Docking…'}` : `🔗 ${texts.docking}`}
          </button>
        </div>
        <div className="button-row" style={{ marginTop: 12, gap: 8 }}>
  <button
    type="button"
    className={`action-btn-large ${exploded ? 'active' : ''}`}
    onClick={() => setExploded(!exploded)}
    style={{
      background: exploded ? 'rgba(0, 212, 255, 0.15)' : undefined,
      border: exploded ? '1px solid #00d4ff' : undefined,
      flex: 1
    }}
  >
    {exploded ? '🔧 СБОРКА' : '💥 РАЗБОР (JARVIS)'}
  </button>
  <button
    type="button"
    className={`action-btn-large ${xrayMode ? 'active' : ''}`}
    onClick={() => setXrayMode(!xrayMode)}
    style={{
      background: xrayMode ? 'rgba(0, 255, 255, 0.15)' : undefined,
      border: xrayMode ? '1px solid #00ffff' : undefined,
      flex: 1
    }}
  >
    🩻 X-RAY
  </button>
</div>

{selectedModule && (
  <div style={{
    marginTop: 12,
    padding: '12px',
    borderRadius: 8,
    background: 'rgba(0, 212, 255, 0.1)',
    border: '1px solid rgba(0, 212, 255, 0.4)',
    boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)',
    fontSize: 12,
    color: '#e0f2fe',
    animation: 'holoFadeIn 0.3s ease-out'
  }}>
    {/* Заголовок с кнопкой закрытия */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(0, 212, 255, 0.3)' }}>
      <span style={{ 
        fontWeight: 'bold', 
        color: '#00d4ff',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        🔧 {selectedModule}
      </span>
      <button
        type="button"
        onClick={() => setSelectedModule(null)}
        style={{
          background: 'transparent',
          border: '1px solid rgba(239, 68, 68, 0.6)',
          color: '#ef4444',
          cursor: 'pointer',
          fontSize: 14,
          padding: '2px 8px',
          borderRadius: 4,
          transition: 'all 0.2s'
        }}
        title="Закрыть"
        onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
        onMouseLeave={(e) => e.target.style.background = 'transparent'}
      >
        ✕
      </button>
    </div>

    {/* Характеристики модуля */}
    <div style={{ fontSize: 11, lineHeight: 1.6 }}>
      {(() => {
        const specs = MODULE_SPECS[selectedModule] || MODULE_SPECS.default
        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(232,238,248,0.7)' }}>📋 Тип:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{specs.type}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(232,238,248,0.7)' }}>⚖️ Масса:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{specs.mass}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(232,238,248,0.7)' }}>🔩 Материал:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{specs.material}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(232,238,248,0.7)' }}>📅 Запуск:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{specs.launch}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(232,238,248,0.7)' }}>📐 Объём:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{specs.volume}</span>
            </div>
            <div style={{ 
              marginTop: 8, 
              paddingTop: 8, 
              borderTop: '1px solid rgba(0, 212, 255, 0.2)',
              color: 'rgba(232,238,248,0.85)',
              fontSize: 10.5,
              lineHeight: 1.5
            }}>
              {specs.desc}
            </div>
          </>
        )
      })()}
    </div>
  </div>
)}

        <div className="button-row" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <button type="button" className="secondary-btn" onClick={exportSnapshot}>
            📤 {texts.exportSnapshot}
          </button>
          <button type="button" className="secondary-btn" onClick={runAuditVerify}>
            🔗 {texts.verifyAudit}
          </button>
        </div>

        {modules.length ? (
          <div className="control-group" style={{ marginTop: 10 }}>
            <div className="control-label">
              <span className="label-icon">⚖</span>
              <span>{texts.totalMass}</span>
              <span className="label-value">{(totalMassKg / 1000).toFixed(1)} т</span>
            </div>
          </div>
        ) : null}

        <div className="status-message">
          <span className="status-icon">⚡</span>
          <span>{canDock ? texts.ready : `${texts.dockUnavailable} (${texts.dockReplay})`}</span>
        </div>

        <button type="button" className="upload-btn" onClick={handleRefreshModules}>
          📁 {texts.upload}
        </button>
        
        <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
       <div style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', marginBottom: 6 }}>
         📊 {language === 'ru' ? 'ИСТОЧНИКИ ДАННЫХ' : 'DATA SOURCES'}
       </div>
       <div style={{ fontSize: 10, color: 'rgba(232,238,248,0.85)', lineHeight: 1.5 }}>
         <div>🌍 <span style={{ color: 'rgba(232,238,248,0.7)' }}>{language === 'ru' ? 'Орбита:' : 'Orbit:'}</span> Celestrak (TLE)</div>
         <div>🛰 <span style={{ color: 'rgba(232,238,248,0.7)' }}>{language === 'ru' ? '3D модели:' : '3D Models:'}</span> NASA 3D Resources / GrabCAD</div>
         <div>🔬 <span style={{ color: 'rgba(232,238,248,0.7)' }}>{language === 'ru' ? 'Данные:' : 'Data:'}</span> Open Source / ROSCOSMOS</div>
       </div>
     </div>
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
            <span className="panel-title">{texts.timeline}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { k: 'all', label: texts.timelineFilterAll },
              { k: 'dock', label: texts.timelineFilterDock },
              { k: 'predict', label: texts.timelineFilterPredict },
              { k: 'modules', label: texts.timelineFilterModules },
            ].map(({ k, label }) => (
              <button
                key={k}
                type="button"
                className="secondary-btn"
                style={{ padding: '8px 10px', fontSize: 11, opacity: timelineFilter === k ? 1 : 0.65 }}
                onClick={() => setTimelineFilter(k)}
              >
                {label}
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
                <button
                  key={e.hash}
                  type="button"
                  className="log-entry log-entry--btn"
                  onClick={() => {
                    if (String(e.action).includes('dock') || String(e.action).includes('expand')) {
                      const candidate = modules.find((m) => !m.attached) || modules[0]
                      if (!candidate) return
                      setCameraPreset('docking')
                      dockingCompletionGuard.current = false
                      setDockingAnim({
                        module: { ...candidate, visible: true },
                        durationMs: 1800,
                        replayOnly: true,
                      })
                      setIsDocking(true)
                      setTimeout(() => {
                        setDockingAnim(null)
                        setIsDocking(false)
                      }, 2200)
                    }
                  }}
                  title={texts.replayTimelineHint}
                >
                  <span className="log-time">{new Date(e.time).toLocaleTimeString()}</span>
                  <span className="log-action">{e.action}</span>
                </button>
              ))}
          </div>
        </div>

        {predict?.points?.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">📈</span>
              <span className="panel-title">{texts.predict}</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <OrbitTrack2D points={predict.points} width={236} height={118} />
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
            {issAiForecast ? (
              <div
                className="ai-forecast-card"
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(48, 231, 140, 0.07)',
                  border: '1px solid rgba(48, 231, 140, 0.28)',
                }}
              >
                <div className="panel-header" style={{ marginBottom: 8, border: 'none', paddingBottom: 0 }}>
                  <span className="panel-icon">🤖</span>
                  <span className="panel-title">{texts.aiForecastTitle}</span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(232,238,248,0.94)', marginBottom: 10 }}>
                  {language === 'ru' ? issAiForecast.summary_ru : issAiForecast.summary_en}
                </p>
                <div style={{ fontSize: 11, color: 'rgba(180,200,230,0.96)', display: 'grid', gap: 5 }}>
                  <div>
                    <span style={{ color: 'rgba(0,212,255,0.9)' }}>{texts.aiForecastConfidence}:</span>{' '}
                    {(Number(issAiForecast.confidence) * 100).toFixed(0)}%
                  </div>
                  <div>
                    <span style={{ color: 'rgba(0,212,255,0.9)' }}>{texts.aiForecastModel}:</span> {issAiForecast.model}
                  </div>
                  <div>
                    <span style={{ color: 'rgba(0,212,255,0.9)' }}>{texts.aiForecastFactors}:</span>{' '}
                    {(issAiForecast.factors || []).join(', ')}
                  </div>
                  {issAiForecast.highlights && Object.keys(issAiForecast.highlights).length ? (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: 'rgba(0,212,255,0.9)' }}>{texts.aiForecastHighlights}:</span>
                      <div
                        style={{
                          fontFamily: 'Consolas, monospace',
                          marginTop: 4,
                          fontSize: 10,
                          lineHeight: 1.4,
                          color: 'rgba(232,238,248,0.88)',
                        }}
                      >
                        H {issAiForecast.highlights.altitude_km_mean ?? '—'} km ({issAiForecast.highlights.altitude_km_min ?? '—'}–
                        {issAiForecast.highlights.altitude_km_max ?? '—'}) · Δφ {issAiForecast.highlights.latitude_range_deg ?? '—'}° ·
                        v̄ {issAiForecast.highlights.mean_velocity_kmh ?? '—'} km/h · {issAiForecast.highlights.data_source ?? predict.source}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {stations?.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🛰</span>
              <span className="panel-title">{texts.stations}</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 160 }}>
              {stations.map((s) => (
                <div key={s.id} className="log-entry">
                  <span className="log-time">{language === 'ru' ? s.nameRu : s.name}</span>
                  <span className="log-action">
                    {Number(s.position?.altitude_km ?? 0).toFixed(0)} {texts.altUnitKm}
                  </span>
                </div>
              ))}
            </div>
            {link ? (
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(232,238,248,0.9)' }}>
                {texts.linkLabel}: {link.a.toUpperCase()} ↔ {link.b.toUpperCase()} — {Number(link.distance_km).toFixed(0)}{' '}
                {texts.altUnitKm}, {Number(link.delay_ms).toFixed(1)} ms
              </div>
            ) : null}
          </div>
        ) : null}

        {securePacket ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🔐</span>
              <span className="panel-title">{texts.secureChannel}</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 120 }}>
              <div className="log-entry">
                <span className="log-time">{texts.secureAlg}</span>
                <span className="log-action">{securePacket.algorithm}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">{texts.secureSig}</span>
                <span className="log-action">{String(securePacket.signature || '').slice(0, 18)}...</span>
              </div>
              <div className="log-entry">
                <span className="log-time">{texts.secureNonce}</span>
                <span className="log-action">{securePacket.nonce}</span>
              </div>
            </div>
          </div>
        ) : null}

        {scosPermit?.permit ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🛡</span>
              <span className="panel-title">{texts.scosPermit}</span>
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
              <span className="panel-title">{texts.aiTitle}</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 120 }}>
              <div className="log-entry">
                <span className="log-time">{texts.aiRec}</span>
                <span className="log-action">{aiRecommendation.recommendation}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">{texts.aiConf}</span>
                <span className="log-action">{Number(aiRecommendation.confidence).toFixed(2)}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">{texts.aiRisk}</span>
                <span className="log-action">{Number(aiRecommendation.risk_score).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {judgeAnalytics?.kpis ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-header" style={{ marginBottom: 12 }}>
              <span className="panel-icon">🏁</span>
              <span className="panel-title">{texts.judgeKpi}</span>
            </div>
            <div className="audit-log" style={{ maxHeight: 140 }}>
              <div className="log-entry">
                <span className="log-time">{texts.kpisInnovation}</span>
                <span className="log-action">{judgeAnalytics.innovation_score}/100</span>
              </div>
              <div className="log-entry">
                <span className="log-time">{texts.kpisEvents}</span>
                <span className="log-action">{judgeAnalytics.kpis.total_events}</span>
              </div>
              <div className="log-entry">
                <span className="log-time">{texts.kpisIntegrity}</span>
                <span className="log-action">
                  {judgeAnalytics.kpis.integrity_ok ? texts.integrityOk : texts.integrityFail}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App