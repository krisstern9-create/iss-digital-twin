import { useState, useRef, useCallback, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'

// ========== ПРЕЗАГРУЗКА МОДЕЛЕЙ ==========
useGLTF.preload('/models/z1_base.glb')
useGLTF.preload('/models/uslab_laboratory.glb')
useGLTF.preload('/models/solar_panel_power.glb')
useGLTF.preload('/models/airlock_hub.glb')
useGLTF.preload('/models/fgb_base.glb')
useGLTF.preload('/models/columbus_laboratory.glb')

// ========== КОМПОНЕНТ ЗЕМЛИ ==========
function Earth() {
  const earthRef = useRef()
  
  useFrame((state, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.02
    }
  })

  return (
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[5, 64, 64]} />
        <meshStandardMaterial color="#1a4d8f" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh scale={[1.02, 1.02, 1.02]}>
        <sphereGeometry args={[5, 64, 64]} />
        <meshStandardMaterial color="#4a9eff" transparent opacity={0.3} roughness={0.5} />
      </mesh>
    </group>
  )
}

// ========== КОМПОНЕНТ МОДУЛЯ ==========
function StationModule({ module, position, onClick, language }) {
  const [hovered, setHovered] = useState(false)
  const [loadError, setLoadError] = useState(false)

  if (!module || !module.type) {
    return null
  }

  const modelPaths = {
    'base': '/models/z1_base.glb',
    'laboratory': '/models/uslab_laboratory.glb',
    'power': '/models/solar_panel_power.glb',
    'hub': '/models/airlock_hub.glb',
    'service': '/models/fgb_base.glb',
    'expansion': '/models/columbus_laboratory.glb',
    'docking': '/models/pma1_docking.glb'
  }

  const modelPath = modelPaths[module.type] || '/models/z1_base.glb'

  let model = null
  try {
    const { scene } = useGLTF(modelPath)
    model = scene
  } catch (error) {
    if (!loadError) {
      console.warn(`Failed to load ${modelPath}:`, error)
      setLoadError(true)
    }
  }

  const handleClick = useCallback(() => {
    if (onClick) onClick(module)
  }, [onClick, module])

  // Fallback геометрия если модель не загрузилась
  if (loadError || !model) {
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
      <primitive object={model.clone()} scale={0.3} />
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

// ========== 3D СЦЕНА ==========
function Scene({ modules, orientation, onModuleClick, language }) {
  const stationRef = useRef()
  
  useFrame((state, delta) => {
    if (stationRef.current) {
      stationRef.current.rotation.x = THREE.MathUtils.lerp(stationRef.current.rotation.x, orientation.x * Math.PI / 180, delta * 2)
      stationRef.current.rotation.y = THREE.MathUtils.lerp(stationRef.current.rotation.y, orientation.y * Math.PI / 180, delta * 2)
    }
  })

  const visibleModules = modules.filter(m => m && m.visible && m.attached)

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Earth />
      <group position={[0, 0, 25]} ref={stationRef}>
        {visibleModules.map((module, index) => {
          const x = module.position?.x || 0
          const y = module.position?.y || 0
          const z = module.position?.z || (index * 8 - visibleModules.length * 4)
          return (
            <StationModule 
              key={module.id} 
              module={module} 
              position={[x, y, z]} 
              onClick={onModuleClick}
              language={language}
            />
          )
        })}
      </group>
      <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} minDistance={10} maxDistance={100} />
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
  
  const [modules, setModules] = useState([
    { id: 1, name: 'Laboratory Module', nameRu: 'Лабораторный модуль', type: 'laboratory', attached: true, visible: true, position: { x: 0, y: 0, z: 0 } },
    { id: 2, name: 'Power Module', nameRu: 'Энергетический модуль', type: 'power', attached: true, visible: true, position: { x: 10, y: 0, z: 0 } },
    { id: 3, name: 'Habitation Module', nameRu: 'Жилой модуль', type: 'base', attached: true, visible: true, position: { x: 0, y: 0, z: 10 } },
    { id: 4, name: 'Hub Module', nameRu: 'Узловой модуль', type: 'hub', attached: true, visible: true, position: { x: 0, y: 0, z: -10 } },
    { id: 5, name: 'Service Module', nameRu: 'Сервисный модуль', type: 'service', attached: true, visible: true, position: { x: 0, y: 8, z: 0 } },
    { id: 6, name: 'Science Module', nameRu: 'Научный модуль', type: 'laboratory', attached: false, visible: false, position: { x: -10, y: 0, z: 0 } },
    { id: 7, name: 'Cargo Module', nameRu: 'Грузовой модуль', type: 'expansion', attached: false, visible: false, position: { x: 0, y: -8, z: 0 } },
    { id: 8, name: 'Airlock Module', nameRu: 'Шлюзовой модуль', type: 'hub', attached: false, visible: false, position: { x: 8, y: 0, z: 8 } },
    { id: 9, name: 'Solar Panel 1', nameRu: 'Солнечная панель 1', type: 'power', attached: true, visible: true, position: { x: 12, y: 0, z: 5 } },
    { id: 10, name: 'Solar Panel 2', nameRu: 'Солнечная панель 2', type: 'power', attached: true, visible: true, position: { x: 12, y: 0, z: -5 } }
  ])

  const createAuditLog = useCallback((action, params) => {
    const record = {
      timestamp: new Date().toISOString(),
      action,
      params,
      hash: Math.random().toString(36).substring(2, 15)
    }
    setAuditLog(prev => [...prev.slice(-4), record])
  }, [])

  const handleDock = () => {
    if (isDocking) return
    setIsDocking(true)
    createAuditLog('dock_started', {})
    
    setTimeout(() => {
      const availableModule = modules.find(m => !m.attached)
      if (availableModule) {
        setModules(prev => prev.map(m => 
          m.id === availableModule.id ? { ...m, attached: true, visible: true } : m
        ))
        createAuditLog('dock_completed', { module: availableModule.name })
      }
      setIsDocking(false)
    }, 2000)
  }

  const toggleModule = (id) => {
    setModules(prev => prev.map(m => 
      m.id === id ? { ...m, visible: !m.visible } : m
    ))
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
      language: 'ENGLISH'
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
      language: 'РУССКИЙ'
    }
  }

  const texts = t[language]

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
              createAuditLog('orbit_changed', { height: orbitHeight })
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
              createAuditLog('orientation_changed', { angle: orientation.y })
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
              createAuditLog('inclination_changed', { value: inclination })
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
              createAuditLog('panel_angle_changed', { angle: panelAngle })
            }}
            className="slider"
          />
        </div>

        <div className="status-bar">
          <div className="status-indicator online"></div>
          <span>API: Подключение...</span>
        </div>
      </div>

      {/* ЦЕНТРАЛЬНАЯ 3D СЦЕНА */}
      <div className="main-view">
        <div className="language-toggle" onClick={toggleLanguage}>
          {texts.language}
        </div>
        <Suspense fallback={<div className="loading">Загрузка 3D...</div>}>
          <Canvas camera={{ position: [0, 0, 60], fov: 50 }}>
            <Scene 
              modules={modules} 
              orientation={orientation}
              onModuleClick={(module) => console.log('Module clicked:', module)}
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
                <div className="module-status">{module.attached ? 'Подключен' : 'Доступен'}</div>
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

        <button className="primary-btn" onClick={() => createAuditLog('add_module_clicked', {})}>
          + {texts.addModule}
        </button>

        <div className="button-row">
          <button className="secondary-btn" onClick={() => createAuditLog('save_clicked', {})}>
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

        <button className="upload-btn" onClick={() => createAuditLog('upload_clicked', {})}>
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
      </div>
    </div>
  )
}

export default App