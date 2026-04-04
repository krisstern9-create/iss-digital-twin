const DEFAULT_API_BASE = 'http://localhost:8000'

export function getApiBase() {
  return import.meta.env.VITE_API_URL || DEFAULT_API_BASE
}

async function request(path, options = {}) {
  const base = getApiBase()
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return await res.json()
  }
  return await res.text()
}

export function apiHealth() {
  return request('/api/health')
}

export function apiGetPosition() {
  return request('/api/station/position')
}

// ========== МАППИНГ ТИПОВ МОДУЛЕЙ (ТЗ п.3.2) ==========
const MODULE_TYPE_MAP = {
  // === ЛАБОРАТОРНЫЕ МОДУЛИ ===
  'JEM': 'laboratory', 'Kibo': 'laboratory', 'Кибо': 'laboratory',
  'PMM': 'laboratory', 'AMS': 'laboratory', 'AMS-02': 'laboratory',
  'Наука': 'laboratory', 'Nauka': 'laboratory', 'MLM': 'laboratory',
  'Columbus': 'laboratory', 'Destiny': 'laboratory', 'US Lab': 'laboratory',
  'Kvant-1': 'laboratory', 'Kristall': 'laboratory', 'Spektr': 'laboratory',
  'Priroda': 'laboratory', 'BEAM': 'laboratory',
  
  // === УЗЛОВЫЕ МОДУЛИ (стыковочные/шлюзовые) ===
'MRM-1': 'nodal', 'Поиск': 'nodal', 'Poisk': 'nodal',
'MRM-2': 'nodal', 'Рассвет': 'nodal', 'Rassvet': 'nodal',
'Пирс': 'nodal', 'Pirs': 'nodal', 'SO1': 'nodal',
'Пирс (стыковочный)': 'nodal',  // ← ДОБАВЛЕНО
'Unity': 'nodal', 'Node 1': 'nodal', 'Harmony': 'nodal', 'Node 2': 'nodal',
'Tranquility': 'nodal', 'Node 3': 'nodal', 'Kvant-2': 'nodal',

  // === ЭНЕРГЕТИЧЕСКИЕ МОДУЛИ (фермы, батареи, радиаторы) ===
  'S6': 'power', 'P6': 'power', 'S5': 'power', 'P5': 'power',
  'S4': 'power', 'P4': 'power', 'S3': 'power', 'P3': 'power',
  'S1': 'power', 'P1': 'power', 'S0': 'power',
  'ELC-1': 'power', 'ELC-2': 'power', 'ELC-3': 'power', 'ELC-4': 'power',
  'ELC1': 'power', 'EС-1': 'power', 'ЕС-1': 'power', // fallback для опечаток
  'ESP-2': 'power', 'ESP-3': 'power',
  
  // === БАЗОВЫЕ МОДУЛИ (ядро станции, управление, СЖО) ===
  'Заря': 'base', 'Zarya': 'base', 'FGB': 'base',
  'Звезда': 'base', 'Zvezda': 'base', 'DOS-8': 'base',
  'ВС-1': 'base', 'ВС-2': 'base', 'ВС-3': 'base', 'ВС-4': 'base',
  'NEM-1': 'base', 'NEM-2': 'base', 'Базовый': 'base',
}

function getModuleType(module) {
  // Проверяем по английскому названию
  if (module.name && MODULE_TYPE_MAP[module.name]) {
    return MODULE_TYPE_MAP[module.name]
  }
  // Проверяем по русскому названию
  if (module.nameRu && MODULE_TYPE_MAP[module.nameRu]) {
    return MODULE_TYPE_MAP[module.nameRu]
  }
  // Проверяем по типу (если бэкенд уже вернул type)
  if (module.type && MODULE_TYPE_MAP[module.type]) {
    return MODULE_TYPE_MAP[module.type]
  }
  // Fallback: базовый модуль по умолчанию
  return 'base'
}
// =====================================================

export function apiGetModules() {
  return request('/api/station/modules').then(response => {
    const modules = response.modules || response || []
    // Добавляем поле moduleType к каждому модулю
    return {
      modules: modules.map(module => ({
        ...module,
        moduleType: getModuleType(module)
      }))
    }
  })
}

export function apiSetModuleVisibility(moduleId, visible) {
  const v = visible ? 'true' : 'false'
  return request(`/api/station/modules/${moduleId}/visibility?visible=${v}`, { method: 'PUT' })
}

export function apiSetModuleAttached(moduleId, attached) {
  const v = attached ? 'true' : 'false'
  return request(`/api/station/modules/${moduleId}/attach?attached=${v}`, { method: 'PUT' })
}

export function apiDock(moduleName) {
  return request(`/api/station/dock?module_name=${encodeURIComponent(moduleName)}`, { method: 'POST' })
}

export function apiExpand(moduleType) {
  return request(`/api/station/expand?module_type=${encodeURIComponent(moduleType)}`, { method: 'POST' })
}

export function apiAuditLog(limit = 50) {
  return request(`/api/audit/log?limit=${encodeURIComponent(limit)}`)
}

export function apiAuditVerify() {
  return request('/api/audit/verify')
}

export function apiAuditTimeline(limit = 200) {
  return request(`/api/audit/timeline?limit=${encodeURIComponent(limit)}`)
}

export function apiPredictTrack(hours = 6, stepMin = 30) {
  return request(`/api/predict/track?hours=${encodeURIComponent(hours)}&step_min=${encodeURIComponent(stepMin)}`)
}

/** Прогноз траектории МКС + встроенный AI-разбор (тот же трек, что у predict/track). */
export function apiAiForecast(hours = 6, stepMin = 30) {
  return request(`/api/ai/forecast?hours=${encodeURIComponent(hours)}&step_min=${encodeURIComponent(stepMin)}`)
}

export function apiStations() {
  return request('/api/stations')
}

export function apiStationLink(a, b) {
  return request(`/api/stations/link?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
}

export function apiSecureEncrypt(payload) {
  return request(`/api/secure/encrypt?payload=${encodeURIComponent(payload)}`, { method: 'POST' })
}

export function apiScosPolicyCheck(domain, port = 443) {
  return request(`/api/scos/policy/check?domain=${encodeURIComponent(domain)}&port=${encodeURIComponent(port)}`, { method: 'POST' })
}

export function apiScosPermit(districtId, domain, port = 443, ttlSec = 300) {
  return request(
    `/api/scos/permit?district_id=${encodeURIComponent(districtId)}&domain=${encodeURIComponent(domain)}&port=${encodeURIComponent(port)}&ttl_sec=${encodeURIComponent(ttlSec)}`,
    { method: 'POST' },
  )
}

export function apiAiRecommendation() {
  return request('/api/ai/recommendation')
}

export function apiJudgeAnalytics() {
  return request('/api/analytics/judge')
}