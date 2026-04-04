import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ISS_STL_PARTS, STL_BASE_SCALE } from './issManifest'

/**
 * @param {{ visibleGroupKeys: string[], panelAngleDeg: number, hiddenGroups?: Set<string> }} props
 */
export function IssStlAssembly({ visibleGroupKeys = [], panelAngleDeg = 0, hiddenGroups, moduleColors }) {
  const paths = useMemo(() => ISS_STL_PARTS.map((p) => p.path), [])
  const geometries = useLoader(STLLoader, paths)

  const rootRef = useRef(null)
    // Маппинг групп STL на типы модулей (для раскраски)
  const groupToType = useMemo(() => {
    const map = {}
    // ЛАБОРАТОРНЫЕ
    if (visibleGroupKeys.includes('JEM')) map['JEM'] = 'laboratory'
    if (visibleGroupKeys.includes('PMM')) map['PMM'] = 'laboratory'
    if (visibleGroupKeys.includes('AMS')) map['AMS'] = 'laboratory'
    // УЗЛОВЫЕ
    if (visibleGroupKeys.includes('MRM1')) map['MRM1'] = 'nodal'
    if (visibleGroupKeys.includes('MRM2')) map['MRM2'] = 'nodal'
    if (visibleGroupKeys.includes('Пирс')) map['Pirs'] = 'nodal'
    // ЭНЕРГЕТИЧЕСКИЕ
    if (visibleGroupKeys.includes('S6')) map['S6'] = 'power'
    if (visibleGroupKeys.includes('P6')) map['P6'] = 'power'
    if (visibleGroupKeys.includes('S5')) map['S5'] = 'power'
    if (visibleGroupKeys.includes('P5')) map['P5'] = 'power'
    // БАЗОВЫЕ (по умолчанию)
    visibleGroupKeys.forEach(g => {
      if (!map[g]) map[g] = 'base'
    })
    return map
  }, [visibleGroupKeys])

  const meshes = useMemo(() => {
    return ISS_STL_PARTS.map((part, i) => {
      const geom = geometries[i].clone()
      geom.computeVertexNormals()
      geom.center()
      const groupHidden = hiddenGroups?.has(part.group) ?? false
      const showAll = visibleGroupKeys.length === 0
      const show = !groupHidden && (showAll || visibleGroupKeys.includes(part.group))
      return { part, geom, show }
    })
  }, [geometries, visibleGroupKeys, hiddenGroups])

  useFrame(() => {
    const rad = (panelAngleDeg * Math.PI) / 180
    ISS_STL_PARTS.forEach((part, index) => {
      if (!part.path.includes('S6-plate')) return
      const g = rootRef.current?.children[index]
      if (!g) return
      const base = part.rot || [0, 0, 0]
      g.rotation.set(base[0] + rad * 0.9, base[1], base[2])
    })
  })

  return (
    <group ref={rootRef} scale={STL_BASE_SCALE}>
      {meshes.map(({ part, geom, show }) => (
        <group
          key={part.path}
          position={part.pos}
          rotation={part.path.includes('S6-plate') ? [0, 0, 0] : part.rot || [0, 0, 0]}
          visible={show}
        >
          <mesh geometry={geom}>
            <meshStandardMaterial
              color={moduleColors?.[groupToType[part.group]] || '#b8c8dc'}
              metalness={0.45}
              roughness={0.42}
              envMapIntensity={0.9}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Один сегмент для анимации стыковки (клон геометрии MRM2 body) */
export function DockingStlCraft({ position, rotation = [0, 0, 0] }) {
  const path = '/models/MRM2/MRM2-BODY.STL'
  const geom = useLoader(STLLoader, path)
  const g = useMemo(() => {
    const geo = geom.clone()
    geo.computeVertexNormals()
    geo.center()
    return geo
  }, [geom])

  return (
    <group position={position} rotation={rotation} scale={STL_BASE_SCALE}>
      <mesh geometry={g}>
        <meshStandardMaterial color="#9ec0e8" metalness={0.5} roughness={0.38} emissive="#061a2e" emissiveIntensity={0.2} />
      </mesh>
    </group>
  )
}
