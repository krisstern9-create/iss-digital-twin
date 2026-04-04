/**
 * Плоская проекция трека по lat/lon (экваториальная сетка) для панели «прогноз».
 */
export function OrbitTrack2D({ points, width = 220, height = 110 }) {
  if (!points?.length) return null

  const pad = 8
  const w = width - pad * 2
  const h = height - pad * 2

  const toXY = (lat, lon) => {
    const x = pad + ((lon + 180) / 360) * w
    const y = pad + ((90 - lat) / 180) * h
    return [x, y]
  }

  const d = points
    .map((p, i) => {
      const [x, y] = toXY(Number(p.latitude), Number(p.longitude))
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  const [cx, cy] = toXY(Number(points[0].latitude), Number(points[0].longitude))

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', borderRadius: 8, background: 'rgba(8,16,32,0.85)', border: '1px solid rgba(0,212,255,0.25)' }}
      aria-hidden
    >
      <defs>
        <linearGradient id="ot2d-grid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(0,212,255,0.12)" />
          <stop offset="100%" stopColor="rgba(100,150,255,0.06)" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="url(#ot2d-grid)" />
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={`v-${t}`}
          x1={pad + t * w}
          y1={pad}
          x2={pad + t * w}
          y2={pad + h}
          stroke="rgba(0,212,255,0.12)"
          strokeWidth={1}
        />
      ))}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={`h-${t}`}
          x1={pad}
          y1={pad + t * h}
          x2={pad + w}
          y2={pad + t * h}
          stroke="rgba(0,212,255,0.12)"
          strokeWidth={1}
        />
      ))}
      <path d={d} fill="none" stroke="#2ad4ff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
      <circle cx={cx} cy={cy} r={3.5} fill="#ffd447" stroke="#1a1f2e" strokeWidth={1} />
    </svg>
  )
}
