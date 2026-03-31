import { useState, useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import './App.css'

// Устанавливаем токен Cesium (оставляем undefined для бесплатных источников)
Cesium.Ion.defaultAccessToken = undefined

function App() {
  const viewerContainerRef = useRef(null)
  const viewerRef = useRef(null)
  const [viewerInitialized, setViewerInitialized] = useState(false)
  
  // Параметры орбиты
  const [orbitHeight, setOrbitHeight] = useState(408)
  const [inclination, setInclination] = useState(51.6)
  const [orientation, setOrientation] = useState({ x: 0, y: 0, z: 0 })
  
  // Модули станции
  const [modules, setModules] = useState([
    { id: 1, name: 'Zarya', nameRu: 'Заря', type: 'base', attached: true, visible: true, position: { x: 0, y: 0, z: 0 } },
    { id: 2, name: 'Zvezda', nameRu: 'Звезда', type: 'service', attached: true, visible: true, position: { x: 0, y: 0, z: 20 } },
    { id: 3, name: 'Nauka', nameRu: 'Наука', type: 'laboratory', attached: true, visible: true, position: { x: 0, y: 0, z: -20 } }
  ])
  
  // Состояния стыковки
  const [isDocking, setIsDocking] = useState(false)
  const [dockingProgress, setDockingProgress] = useState(0)
  const [dockingModule, setDockingModule] = useState(null)
  
  // Позиция МКС
  const [issPosition, setIssPosition] = useState(null)
  const [language, setLanguage] = useState('ru')
  const [auditLog, setAuditLog] = useState([])
  const [showOrbitPath, setShowOrbitPath] = useState(true)
  const [nextModuleId, setNextModuleId] = useState(4)
  const [aiPrediction, setAiPrediction] = useState(null)
  const [error, setError] = useState(null)
  
  // Ссылки на сущности Cesium
  const issEntityRef = useRef(null)
  const orbitEntityRef = useRef(null)
  const moduleEntitiesRef = useRef([])
  const dockingModuleEntityRef = useRef(null)
  const cameraMovingRef = useRef(false)

  // Переводы
  const texts = {
    ru: {
      title: 'Цифровой двойник МКС/РОСС',
      subtitle: 'Interactive Space Station Digital Twin',
      orbitHeight: 'Высота орбиты (км)',
      inclination: 'Наклонение орбиты (°)',
      orientation: 'Ориентация станции',
      dock: 'Пристыковать модуль',
      modules: 'Модули станции',
      position: 'Позиция МКС',
      language: 'EN',
      showOrbit: 'Показать орбиту',
      auditLog: 'Журнал аудита',
      aiPrediction: 'AI Прогноз (1ч)',
      docking: 'Стыковка...',
      latitude: 'Широта',
      longitude: 'Долгота',
      altitude: 'Высота',
      velocity: 'Скорость',
      verify: 'Проверить целостность'
    },
    en: {
      title: 'ISS/ROSS Digital Twin',
      subtitle: 'Interactive Space Station Digital Twin',
      orbitHeight: 'Orbit Height (km)',
      inclination: 'Orbit Inclination (°)',
      orientation: 'Station Orientation',
      dock: 'Dock Module',
      modules: 'Station Modules',
      position: 'ISS Position',
      language: 'RU',
      showOrbit: 'Show Orbit',
      auditLog: 'Audit Log',
      aiPrediction: 'AI Prediction (1h)',
      docking: 'Docking...',
      latitude: 'Latitude',
      longitude: 'Longitude',
      altitude: 'Altitude',
      velocity: 'Velocity',
      verify: 'Verify Integrity'
    }
  }

  const t = texts[language]

  // Создание записи аудита
  const createAuditLog = useCallback((action, params) => {
    const record = {
      timestamp: new Date().toISOString(),
      action,
      params,
      prevHash: auditLog.length > 0 ? auditLog[auditLog.length - 1].hash : 'genesis'
    }
    const recordString = JSON.stringify(record)
    let hash = 0
    for (let i = 0; i < recordString.length; i++) {
      const char = recordString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    record.hash = Math.abs(hash).toString(16).padStart(64, '0')
    setAuditLog(prev => [...prev, record])
    return record
  }, [auditLog])

  // Получение позиции МКС
  useEffect(() => {
    const fetchPosition = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/station/position')
        if (!response.ok) throw new Error('Backend error')
        const data = await response.json()
        setIssPosition(data)
        
        try {
          const predResponse = await fetch('http://localhost:8000/api/predict?hours=1')
          if (predResponse.ok) {
            const predData = await predResponse.json()
            setAiPrediction(predData)
          }
        } catch (e) {
          console.log('Prediction not available')
        }
      } catch (error) {
        setIssPosition(prev => ({
          latitude: 51.6462,
          longitude: ((prev?.longitude || 0) + 0.1) % 360 - 180,
          altitude_km: orbitHeight,
          velocity_kmh: 27600
        }))
      }
    }

    fetchPosition()
    const interval = setInterval(fetchPosition, 5000)
    return () => clearInterval(interval)
  }, [orbitHeight])

  // Инициализация Cesium Viewer
  useEffect(() => {
    if (!viewerContainerRef.current || viewerInitialized) return

    const initViewer = () => {
      if (!viewerContainerRef.current) return

      const rect = viewerContainerRef.current.getBoundingClientRect()
      
      if (rect.width === 0 || rect.height === 0) {
        setTimeout(initViewer, 100)
        return
      }

      try {
        // Создаем Viewer с минимальной конфигурацией
        const viewer = new Cesium.Viewer(viewerContainerRef.current, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: false,
          homeButton: true,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          scene3DOnly: true,
          shouldAnimate: true,
          shadows: false,
          terrainProvider: undefined,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          // Отключаем проблемные компоненты
          skyBox: new Cesium.SkyBox({
            sources: {
              positiveX: 'https://cesium.com/public/SandcastleSampleData/skybox_px.jpg',
              negativeX: 'https://cesium.com/public/SandcastleSampleData/skybox_nx.jpg',
              positiveY: 'https://cesium.com/public/SandcastleSampleData/skybox_py.jpg',
              negativeY: 'https://cesium.com/public/SandcastleSampleData/skybox_ny.jpg',
              positiveZ: 'https://cesium.com/public/SandcastleSampleData/skybox_pz.jpg',
              negativeZ: 'https://cesium.com/public/SandcastleSampleData/skybox_nz.jpg'
            }
          }),
          skyAtmosphere: true,
          sun: true,
          moon: true,
          creditContainer: document.createElement('div')
        })

        // Убираем кредит Cesium
        viewer.cesiumWidget.creditContainer.style.display = 'none'

        // Настраиваем размер canvas
        viewer.canvas.style.width = '100%'
        viewer.canvas.style.height = '100%'
        
        // Принудительный resize
        setTimeout(() => {
          viewer.resize()
        }, 200)

        viewerRef.current = viewer
        setViewerInitialized(true)

        // Устанавливаем начальную камеру
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0
          }
        })

      } catch (error) {
        console.error('Cesium initialization error:', error)
        setError(error.message)
      }
    }

    // Запускаем инициализацию с задержкой
    setTimeout(initViewer, 300)

    // Cleanup
    return () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy()
        } catch (e) {
          console.error('Error destroying viewer:', e)
        }
        viewerRef.current = null
        setViewerInitialized(false)
      }
    }
  }, [viewerInitialized])

  // Обновление позиции МКС и орбиты
  useEffect(() => {
    if (!viewerRef.current || !issPosition || !viewerInitialized) return
    const viewer = viewerRef.current

    if (!issPosition.latitude || !issPosition.longitude || !issPosition.altitude_km) {
      return
    }

    const position = Cesium.Cartesian3.fromDegrees(
      issPosition.longitude,
      issPosition.latitude,
      issPosition.altitude_km * 1000
    )

    // Удаляем старую сущность МКС
    if (issEntityRef.current) {
      viewer.entities.remove(issEntityRef.current)
      issEntityRef.current = null
    }

    try {
      // Добавляем МКС как точку
      issEntityRef.current = viewer.entities.add({
        position: position,
        point: {
          pixelSize: 20,
          color: Cesium.Color.RED,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3
        },
        label: {
          text: 'ISS/ROSS',
          font: 'bold 16px Orbitron, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -30)
        }
      })

      // Обновляем орбитальную траекторию
      if (showOrbitPath) {
        if (orbitEntityRef.current) {
          viewer.entities.remove(orbitEntityRef.current)
        }

        const orbitPoints = []
        const steps = 100
        for (let i = 0; i <= steps; i++) {
          const lon = (i / steps) * 360 - 180
          const lat = Math.sin((i / steps) * Math.PI * 2) * (inclination / 90) * 51.6
          orbitPoints.push(Cesium.Cartesian3.fromDegrees(lon, lat, orbitHeight * 1000))
        }

        orbitEntityRef.current = viewer.entities.add({
          polyline: {
            positions: orbitPoints,
            width: 3,
            material: Cesium.Color.CYAN.withAlpha(0.6)
          }
        })
      }

      // Фокусируем камеру на МКС (только один раз)
      if (issEntityRef.current && !cameraMovingRef.current) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            issPosition.longitude,
            issPosition.latitude,
            issPosition.altitude_km * 1000 + 50000
          ),
          duration: 2
        })
        cameraMovingRef.current = true
      }

    } catch (error) {
      console.error('Error adding entities:', error)
    }
  }, [issPosition, showOrbitPath, inclination, orbitHeight, viewerInitialized])

  // Обновление модулей станции
  useEffect(() => {
    if (!viewerRef.current || !issPosition || !viewerInitialized) return
    const viewer = viewerRef.current

    // Удаляем старые сущности модулей
    moduleEntitiesRef.current.forEach(entity => {
      if (viewer.entities.contains(entity)) {
        viewer.entities.remove(entity)
      }
    })
    moduleEntitiesRef.current = []

    // Добавляем новые модули
    modules.forEach((module, index) => {
      if (!module.visible || !module.attached) return

      const modulePosition = Cesium.Cartesian3.fromDegrees(
        issPosition.longitude,
        issPosition.latitude,
        issPosition.altitude_km * 1000
      )

      // Смещаем каждый модуль вдоль оси станции
      const offset = Cesium.Cartesian3.multiplyByScalar(
        Cesium.Cartesian3.normalize(modulePosition, new Cesium.Cartesian3()),
        module.position.z * 100,
        new Cesium.Cartesian3()
      )

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.add(modulePosition, offset, new Cesium.Cartesian3()),
        box: {
          dimensions: new Cesium.Cartesian3(10, 10, 20),
          material: module.type === 'base' ? Cesium.Color.BLUE : 
                    module.type === 'service' ? Cesium.Color.RED : 
                    Cesium.Color.GREEN,
          outline: true,
          outlineColor: Cesium.Color.WHITE
        },
        label: {
          text: language === 'ru' ? module.nameRu : module.name,
          font: 'bold 12px Orbitron, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -20)
        }
      })

      moduleEntitiesRef.current.push(entity)
    })
  }, [modules, issPosition, orientation, language, viewerInitialized])

  // Обработка стыковки
  const handleDock = async () => {
    if (isDocking) return
    setIsDocking(true)
    setDockingProgress(0)

    const intentValid = orbitHeight > 400 && orbitHeight < 2000
    if (!intentValid) {
      createAuditLog('dock_rejected', { reason: 'unsafe_orbit', height: orbitHeight })
      alert('Docking rejected: Unsafe orbit height')
      setIsDocking(false)
      return
    }

    createAuditLog('dock_initiated', { module_id: nextModuleId })

    // Создаем новый модуль для стыковки
    const newModule = {
      id: nextModuleId,
      name: `Module-${nextModuleId}`,
      nameRu: `Модуль-${nextModuleId}`,
      type: 'expansion',
      attached: false,
      visible: true,
      position: { x: 0, y: 0, z: 50 }
    }
    setDockingModule(newModule)

    // Запускаем 3D анимацию стыковки
    if (viewerRef.current && issPosition) {
      const viewer = viewerRef.current
      const startPos = Cesium.Cartesian3.fromDegrees(
        issPosition.longitude,
        issPosition.latitude,
        issPosition.altitude_km * 1000 + 10000
      )
      const endPos = Cesium.Cartesian3.fromDegrees(
        issPosition.longitude,
        issPosition.latitude,
        issPosition.altitude_km * 1000
      )

      dockingModuleEntityRef.current = viewer.entities.add({
        position: startPos,
        box: {
          dimensions: new Cesium.Cartesian3(10, 10, 20),
          material: Cesium.Color.ORANGE,
          outline: true,
          outlineColor: Cesium.Color.WHITE
        },
        label: {
          text: 'Docking...',
          font: 'bold 12px Orbitron, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -20)
        }
      })

      // Анимация приближения модуля
      let progress = 0
      const animateDock = () => {
        progress += 0.5
        setDockingProgress(Math.min(progress, 100))

        if (progress < 100 && dockingModuleEntityRef.current) {
          const t = progress / 100
          const currentPos = Cesium.Cartesian3.lerp(startPos, endPos, t, new Cesium.Cartesian3())
          dockingModuleEntityRef.current.position = currentPos
          requestAnimationFrame(animateDock)
        } else {
          completeDocking()
        }
      }

      requestAnimationFrame(animateDock)
    } else {
      // Fallback без 3D
      const dockInterval = setInterval(() => {
        setDockingProgress(prev => {
          if (prev >= 100) {
            clearInterval(dockInterval)
            completeDocking()
            return 100
          }
          return prev + 2
        })
      }, 50)
    }
  }

  // Завершение стыковки
  const completeDocking = async () => {
    const newModule = {
      id: nextModuleId,
      name: `Module-${nextModuleId}`,
      nameRu: `Модуль-${nextModuleId}`,
      type: 'expansion',
      attached: true,
      visible: true,
      position: { x: 0, y: 0, z: modules.length * 20 }
    }
    setModules([...modules, newModule])
    setNextModuleId(nextModuleId + 1)

    // Удаляем сущность стыкующегося модуля
    if (dockingModuleEntityRef.current && viewerRef.current) {
      viewerRef.current.entities.remove(dockingModuleEntityRef.current)
      dockingModuleEntityRef.current = null
    }
    setDockingModule(null)

    try {
      await fetch('http://localhost:8000/api/station/dock?module_name=NewModule', {
        method: 'POST'
      })
    } catch (error) {
      console.error('Docking error:', error)
    }

    createAuditLog('dock_completed', { module_id: nextModuleId })

    setTimeout(() => {
      setIsDocking(false)
      setDockingProgress(0)
    }, 1000)
  }

  // Переключение языка
  const toggleLanguage = () => {
    setLanguage(language === 'ru' ? 'en' : 'ru')
    createAuditLog('language_changed', { from: language, to: language === 'ru' ? 'en' : 'ru' })
  }

  // Проверка целостности аудита
  const verifyIntegrity = () => {
    let valid = true
    for (let i = 1; i < auditLog.length; i++) {
      if (auditLog[i].prevHash !== auditLog[i-1].hash) {
        valid = false
        break
      }
    }
    alert(valid ? 'Audit chain verified ✓' : 'Audit chain corrupted!')
  }

  // Безопасное форматирование чисел
  const safeFixed = (num, digits = 2) => {
    if (num === undefined || num === null || isNaN(num)) return 'N/A'
    return Number(num).toFixed(digits)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>{t.title}</h1>
          <p className="subtitle">{t.subtitle}</p>
        </div>
        <div className="header-right">
          <button onClick={toggleLanguage} className="lang-btn">
            <span style={{ marginRight: '0.5rem' }}>{language === 'ru' ? '🌐' : '🌍'}</span>
            {t.language}
          </button>
          <button onClick={verifyIntegrity} className="verify-btn" title={t.verify}>
            🔐
          </button>
        </div>
      </header>

      <div className="main-container">
        <div className="sidebar">
          <div className="control-group">
            <h3>
              <span style={{ color: '#00d4ff', marginRight: '0.5rem' }}>🌍</span>
              {t.orbitHeight}
            </h3>
            <div className="slider-container">
              <input
                type="range"
                min="400"
                max="2000"
                value={orbitHeight}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setOrbitHeight(val)
                  createAuditLog('orbit_changed', { height: val })
                }}
              />
              <span className="slider-value">{orbitHeight} км</span>
            </div>
          </div>

          <div className="control-group">
            <h3>
              <span style={{ color: '#00d4ff', marginRight: '0.5rem' }}>🔺</span>
              {t.inclination}
            </h3>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="90"
                value={inclination}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setInclination(val)
                  createAuditLog('inclination_changed', { value: val })
                }}
              />
              <span className="slider-value">{inclination}°</span>
            </div>
          </div>

          <div className="control-group">
            <h3>
              <span style={{ color: '#00d4ff', marginRight: '0.5rem' }}>🧭</span>
              {t.orientation}
            </h3>
            <div className="orientation-controls">
              <div className="slider-row">
                <label>X</label>
                <input 
                  type="range" 
                  min="-180" 
                  max="180" 
                  value={orientation.x}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setOrientation({...orientation, x: val})
                    createAuditLog('orientation_changed', { axis: 'x', value: val })
                  }}
                />
                <span>{orientation.x}°</span>
              </div>
              <div className="slider-row">
                <label>Y</label>
                <input 
                  type="range" 
                  min="0" 
                  max="360" 
                  value={orientation.y}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setOrientation({...orientation, y: val})
                    createAuditLog('orientation_changed', { axis: 'y', value: val })
                  }}
                />
                <span>{orientation.y}°</span>
              </div>
              <div className="slider-row">
                <label>Z</label>
                <input 
                  type="range" 
                  min="-180" 
                  max="180" 
                  value={orientation.z}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setOrientation({...orientation, z: val})
                    createAuditLog('orientation_changed', { axis: 'z', value: val })
                  }}
                />
                <span>{orientation.z}°</span>
              </div>
            </div>
          </div>

          <button onClick={handleDock} className="dock-btn" disabled={isDocking}>
            {isDocking ? `${t.docking} ${dockingProgress}%` : t.dock}
          </button>

          {isDocking && (
            <div className="docking-progress">
              <div className="progress-bar" style={{ width: `${dockingProgress}%` }}></div>
            </div>
          )}

          <div className="control-group">
            <h3>
              <span style={{ color: '#00d4ff', marginRight: '0.5rem' }}>📦</span>
              {t.modules} ({modules.length})
            </h3>
            <div className="modules-list">
              {modules.map(mod => (
                <label key={mod.id} className="module-toggle">
                  <input
                    type="checkbox"
                    checked={mod.visible}
                    onChange={() => {
                      const newModules = modules.map(m => 
                        m.id === mod.id ? {...m, visible: !m.visible} : m
                      )
                      setModules(newModules)
                      createAuditLog('module_visibility', { id: mod.id, visible: !mod.visible })
                    }}
                  />
                  <span className="module-name">{language === 'ru' ? mod.nameRu : mod.name}</span>
                  <span className="module-type">({mod.type})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showOrbitPath}
                onChange={(e) => {
                  const val = e.target.checked
                  setShowOrbitPath(val)
                  createAuditLog('orbit_visibility', { show: val })
                }}
              />
              {t.showOrbit}
            </label>
          </div>

          {issPosition && (
            <div className="position-info">
              <h3>
                <span style={{ color: '#00ff88', marginRight: '0.5rem' }}>📍</span>
                {t.position}
              </h3>
              <div className="position-grid">
                <div className="position-item">
                  <span className="label">{t.latitude}: </span>
                  <span className="value">{safeFixed(issPosition.latitude, 4)}°</span>
                </div>
                <div className="position-item">
                  <span className="label">{t.longitude}: </span>
                  <span className="value">{safeFixed(issPosition.longitude, 4)}°</span>
                </div>
                <div className="position-item">
                  <span className="label">{t.altitude}: </span>
                  <span className="value">{safeFixed(issPosition.altitude_km, 2)} км</span>
                </div>
                <div className="position-item">
                  <span className="label">{t.velocity}: </span>
                  <span className="value">{safeFixed(issPosition.velocity_kmh / 3600, 2)} км/с</span>
                </div>
              </div>
            </div>
          )}

          {aiPrediction && (
            <div className="ai-prediction">
              <h3>
                <span style={{ color: '#00ff88', marginRight: '0.5rem' }}>🤖</span>
                {t.aiPrediction}
              </h3>
              <div className="position-grid">
                <div className="position-item">
                  <span className="label">{t.latitude}: </span>
                  <span className="value">{safeFixed(aiPrediction.latitude, 4)}°</span>
                </div>
                <div className="position-item">
                  <span className="label">{t.longitude}: </span>
                  <span className="value">{safeFixed(aiPrediction.longitude, 4)}°</span>
                </div>
              </div>
            </div>
          )}

          {auditLog.length > 0 && (
            <div className="audit-section">
              <h3>
                <span style={{ color: '#ffc107', marginRight: '0.5rem' }}>✓</span>
                {t.auditLog} ({auditLog.length})
              </h3>
              <div className="audit-list">
                {auditLog.slice(-5).map((log, idx) => (
                  <div key={idx} className="audit-item">
                    <span className="audit-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="audit-action">{log.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              <h3>
                <span style={{ color: '#ff006e', marginRight: '0.5rem' }}>⚠</span>
                Ошибка
              </h3>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div 
          ref={viewerContainerRef} 
          className="cesium-viewer"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </div>
  )
}

export default App