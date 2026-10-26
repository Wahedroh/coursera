import { AVATAR_H, AVATAR_W, avatarPixels, type AvatarConfig } from '../../shared/avatar'
import { characterById, shapeRows } from '../../shared/characters'

const EGG = ['...kkkk...', '..kwwwwk..', '.kwwbwwwk.', '.kwwwwbwk.', 'kwbwwwwwwk', 'kwwwwbwwwk', 'kwwbwwwwwk', 'kwwwwwwbwk', '.kwwwwwwk.', '..kkkkkk..']
const EGG_PAL: Record<string, string> = { k: '#8a5b00', w: '#FFF8E7', b: '#7EC8E3' }

function Pixels({ rows, pal, size, label }: { rows: readonly string[]; pal: Record<string, string>; size: number; label: string }) {
  const w = rows[0].length
  return (
    <svg width={w * size} height={rows.length * size} viewBox={`0 0 ${w} ${rows.length}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch !== '.' && pal[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={pal[ch]} /> : null)),
      )}
    </svg>
  )
}

export function CharacterArt({ id, size = 5 }: { id: string; size?: number }) {
  const c = characterById(id)
  if (!c) return null
  return <Pixels rows={shapeRows(c)} pal={c.palette} size={size} label={c.name} />
}

export function EggArt({ size = 6 }: { size?: number }) {
  return <Pixels rows={EGG} pal={EGG_PAL} size={size} label="ไข่" />
}

/** ตัวละครแต่งเองของนักเรียน */
export function AvatarArt({ config, size = 6, label = 'ตัวละครของฉัน' }: { config: AvatarConfig; size?: number; label?: string }) {
  return (
    <svg width={AVATAR_W * size} height={AVATAR_H * size} viewBox={`0 0 ${AVATAR_W} ${AVATAR_H}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      {avatarPixels(config).map(([x, y, c]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />
      ))}
    </svg>
  )
}
