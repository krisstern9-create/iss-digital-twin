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

export function apiGetModules() {
  return request('/api/station/modules')
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

export function apiAuditTimeline(limit = 200) {
  return request(`/api/audit/timeline?limit=${encodeURIComponent(limit)}`)
}

export function apiPredictTrack(hours = 6, stepMin = 30) {
  return request(`/api/predict/track?hours=${encodeURIComponent(hours)}&step_min=${encodeURIComponent(stepMin)}`)
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

