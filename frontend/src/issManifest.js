import * as THREE from 'three'

/**
 * Все STL-части МКС: путь относительно /public и смещение в условных единицах сцены.
 * Раскладка упрощённая (трасс + сегменты) для демо MVP.
 */
export const ISS_EARTH_UNITS = {
  demoEarthRadius: 18,
  realEarthRadius: 30,
}

/** Базовый масштаб импорта STL (подогнан под единый вид) */
export const STL_BASE_SCALE = 0.012

/**
 * @typedef {{ path: string, pos: [number, number, number], rot?: [number, number, number], scale?: number }} IssPart
 */

/** Группы папок → ключ для видимости из API */
export const STL_GROUPS = ['Ams', 'ELC1', 'ELC2', 'ELC3', 'ELC4', 'JEM', 'MRM1', 'MRM2', 'P5', 'P6', 'PIRS', 'PMM', 'S5', 'S6']

/**
 * Смещения сегментов вдоль строительной оси (X — грубо трасс, Y/Z — боковые модули).
 * Углы в радианах для rot: [x,y,z].
 */
const SEG = {
  truss: 0,
  jemY: 14,
  rusX: -18,
  elcZ: 9,
}

/** @type {IssPart[]} */
export const ISS_STL_PARTS = [
  // --- JEM (японский сегмент) ---
  { path: '/models/JEM/JEM-body.STL', group: 'JEM', pos: [8, SEG.jemY, 2], rot: [0, 0, 0] },
  { path: '/models/JEM/JEM2-body.STL', group: 'JEM', pos: [10, SEG.jemY + 2, 2], rot: [0, 0.08, 0] },
  { path: '/models/JEM/ARM1.STL', group: 'JEM', pos: [6, SEG.jemY + 1, 5], rot: [0.2, 0, 0.3] },
  { path: '/models/JEM/ARM4-1.STL', group: 'JEM', pos: [5, SEG.jemY, 6], rot: [0.15, 0.1, 0] },
  { path: '/models/JEM/ARM4-2.STL', group: 'JEM', pos: [5.2, SEG.jemY - 0.5, 6.2], rot: [0.12, 0.12, 0] },

  // --- MRM1 / Пирс ---
  { path: '/models/MRM1/MRM1-body.STL', group: 'MRM1', pos: [SEG.rusX, 2, 4], rot: [0, 0.4, 0] },
  { path: '/models/MRM1/MRM1-arm.STL', group: 'MRM1', pos: [SEG.rusX - 1, 3, 5], rot: [0.3, 0.35, 0] },
  { path: '/models/MRM1/MRM1-barell.STL', group: 'MRM1', pos: [SEG.rusX - 2, 1, 3], rot: [0, 0.2, 0] },
  { path: '/models/MRM1/MRM1-barell-console.STL', group: 'MRM1', pos: [SEG.rusX - 2.2, 1.2, 3.2], rot: [0, 0.2, 0] },
  { path: '/models/MRM1/MRM1-console.STL', group: 'MRM1', pos: [SEG.rusX, 0.5, 4.5], rot: [0.1, 0.3, 0] },
  { path: '/models/MRM1/MRM1-knob.STL', group: 'MRM1', pos: [SEG.rusX, 0.3, 4.7], rot: [0, 0.3, 0] },
  { path: '/models/MRM1/MRM1-panel.STL', group: 'MRM1', pos: [SEG.rusX - 1, 4, 2], rot: [0.25, 0.2, 0] },
  { path: '/models/MRM1/MRM1-panel-console.STL', group: 'MRM1', pos: [SEG.rusX - 1.2, 4.2, 2.2], rot: [0.2, 0.2, 0] },
  { path: '/models/MRM1/MRM1-strut1-4pcs.STL', group: 'MRM1', pos: [SEG.rusX - 0.5, 3, 3], rot: [0, 0.35, 0] },
  { path: '/models/MRM1/MRM1-strut2-2pcs.STL', group: 'MRM1', pos: [SEG.rusX - 0.8, 2.5, 3.5], rot: [0.1, 0.3, 0] },

  // --- MRM2 ---
  { path: '/models/MRM2/MRM2-BODY.STL', group: 'MRM2', pos: [SEG.rusX - 6, 0, -3], rot: [0, 0.9, 0] },
  { path: '/models/MRM2/MRM2-ANTENNE1.STL', group: 'MRM2', pos: [SEG.rusX - 5, 1, -4], rot: [0.4, 0.85, 0] },
  { path: '/models/MRM2/MRM2-ANTENNE2.STL', group: 'MRM2', pos: [SEG.rusX - 5.2, 1.2, -3.8], rot: [0.35, 0.85, 0] },

  // --- ELC палубы ---
  { path: '/models/ELC1/ELC1-body.STL', group: 'ELC1', pos: [4, 1, SEG.elcZ], rot: [0, 0, 0] },
  { path: '/models/ELC1/ELC1-box1.STL', group: 'ELC1', pos: [4.5, 1.2, SEG.elcZ + 0.5], rot: [0, 0, 0] },
  { path: '/models/ELC1/ELC1-box2.STL', group: 'ELC1', pos: [3.5, 1.2, SEG.elcZ + 0.5], rot: [0, 0, 0] },
  { path: '/models/ELC1/ELC1-box3.STL', group: 'ELC1', pos: [4, 1.4, SEG.elcZ + 1], rot: [0, 0, 0] },

  { path: '/models/ELC2/ELC2_body.STL', group: 'ELC2', pos: [2, 1, SEG.elcZ], rot: [0, 0, 0.1] },
  { path: '/models/ELC2/ELC2_box1.STL', group: 'ELC2', pos: [2.5, 1.2, SEG.elcZ + 0.4], rot: [0, 0, 0.1] },
  { path: '/models/ELC2/ELC2_box2.STL', group: 'ELC2', pos: [1.5, 1.2, SEG.elcZ + 0.4], rot: [0, 0, 0.1] },
  { path: '/models/ELC2/ELC2_box3.STL', group: 'ELC2', pos: [2, 1.4, SEG.elcZ + 0.9], rot: [0, 0, 0.1] },

  { path: '/models/ELC3/ELC3_body.STL', group: 'ELC3', pos: [0, 1, SEG.elcZ], rot: [0, 0, -0.05] },
  { path: '/models/ELC3/ELC3_box1.STL', group: 'ELC3', pos: [0.5, 1.2, SEG.elcZ + 0.4], rot: [0, 0, -0.05] },
  { path: '/models/ELC3/ELC3_box2.STL', group: 'ELC3', pos: [-0.5, 1.2, SEG.elcZ + 0.4], rot: [0, 0, -0.05] },
  { path: '/models/ELC3/ELC3_box3.STL', group: 'ELC3', pos: [0, 1.4, SEG.elcZ + 0.9], rot: [0, 0, -0.05] },

  { path: '/models/ELC4/ELC4_body.STL', group: 'ELC4', pos: [-2, 1, SEG.elcZ], rot: [0, 0, -0.1] },

  // --- Трасс P5 / S5 / S6 / P6 ---
  { path: '/models/P5/P5-body1.STL', group: 'P5', pos: [-6, 0, 0], rot: [0, 0, 0] },
  { path: '/models/S5/S5_body1.STL', group: 'S5', pos: [-12, 0, 0], rot: [0, 0, 0] },
  { path: '/models/S5/S5_body2.STL', group: 'S5', pos: [-13, 0, 0.5], rot: [0, 0, 0] },

  { path: '/models/S6/S6-beam.STL', group: 'S6', pos: [-18, 0, 0], rot: [0, 0, 0], name: 's6-beam' },
  { path: '/models/S6/S6a-body.STL', group: 'S6', pos: [-19, 0, 0], rot: [0, 0, 0] },
  { path: '/models/S6/S6a-body2.STL', group: 'S6', pos: [-19.2, 0, 0.3], rot: [0, 0, 0] },
  { path: '/models/S6/S6a-box.STL', group: 'S6', pos: [-18.5, 1, 0], rot: [0, 0, 0] },
  { path: '/models/S6/S6-plate1.STL', group: 'S6', pos: [-17, 2, 3], rot: [0.4, 0, 0.2], name: 's6-p1' },
  { path: '/models/S6/S6-plate2.STL', group: 'S6', pos: [-17, 2, -3], rot: [0.4, 0, -0.2], name: 's6-p2' },
  { path: '/models/S6/S6-plate3.STL', group: 'S6', pos: [-20, 2, 3], rot: [0.35, 0, 0.15], name: 's6-p3' },
  { path: '/models/S6/S6-plate4.STL', group: 'S6', pos: [-20, 2, -3], rot: [0.35, 0, -0.15], name: 's6-p4' },

  { path: '/models/P6/P6a-box.STL', group: 'P6', pos: [12, 0, 0], rot: [0, 0, 0] },

  // --- PIRS / PMM / AMS ---
  { path: '/models/PIRS/PIRS-BODY.STL', group: 'PIRS', pos: [SEG.rusX + 4, -2, 2], rot: [0, 0.5, 0] },
  { path: '/models/PIRS/PIRS-ANTENNE1.STL', group: 'PIRS', pos: [SEG.rusX + 5, -1, 3], rot: [0.3, 0.5, 0] },
  { path: '/models/PIRS/PIRS-ANTENNE2.STL', group: 'PIRS', pos: [SEG.rusX + 5.2, -0.8, 3.2], rot: [0.25, 0.5, 0] },

  { path: '/models/PMM/PMM_body.STL', group: 'PMM', pos: [SEG.rusX + 2, 3, -2], rot: [0.1, 0.45, 0] },

  { path: '/models/Ams/AMS_body.STL', group: 'Ams', pos: [14, 8, -4], rot: [0.2, -0.2, 0] },
  { path: '/models/Ams/AMS_box.STL', group: 'Ams', pos: [14.5, 8.5, -4], rot: [0.2, -0.2, 0] },
  { path: '/models/Ams/AMS_console.STL', group: 'Ams', pos: [13.5, 7.5, -3.5], rot: [0.15, -0.15, 0] },
  { path: '/models/Ams/AMS_upper_part.STL', group: 'Ams', pos: [14, 9, -4], rot: [0.25, -0.2, 0] },
  { path: '/models/Ams/AMS_bottom_part.STL', group: 'Ams', pos: [14, 7, -4], rot: [0.2, -0.2, 0] },
]

export function issPartsForGroup(groupName) {
  if (!groupName) return ISS_STL_PARTS
  return ISS_STL_PARTS.filter((p) => p.group === groupName)
}

export function kmToOrbitRadius(orbitHeightKm, earthRadius, scaleKm = 0.045) {
  return earthRadius + orbitHeightKm * scaleKm
}

/** Точки кольцевой орбиты для визуализации траектории */
export function sampleOrbitPoints(orbitR, incDeg, segments = 160) {
  const inc = (incDeg * Math.PI) / 180
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2
    pts.push(
      new THREE.Vector3(
        orbitR * Math.cos(th),
        orbitR * Math.sin(th) * Math.sin(inc),
        orbitR * Math.sin(th) * Math.cos(inc),
      ),
    )
  }
  return pts
}

/** lat/lon/alt → координаты сцены (общий центр с Землёй) */
export function geoToScene(latDeg, lonDeg, altKm, earthRadius, scaleKm = 0.045) {
  const phi = (latDeg * Math.PI) / 180
  const lambda = (lonDeg * Math.PI) / 180
  const R = earthRadius + altKm * scaleKm
  return new THREE.Vector3(
    R * Math.cos(phi) * Math.cos(lambda),
    R * Math.sin(phi),
    R * Math.cos(phi) * Math.sin(lambda),
  )
}
