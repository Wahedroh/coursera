import { avatarBounds, avatarPixels, DEFAULT_AVATAR, HAND_ITEMS, OFFHAND_ITEMS, type AvatarConfig, type HandItem, type OffhandItem } from '../../shared/avatar'
import { eggItemById, itemKey } from '../../shared/eggItems'
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

/** ตัวละครแต่งเองของนักเรียน · กรอบขยายเองเมื่อมีชุดพิเศษ/อุปกรณ์ล้นออกนอกตัว */
export function AvatarArt({ config, size = 6, label = 'ตัวละครของฉัน' }: { config: AvatarConfig; size?: number; label?: string }) {
  const px = avatarPixels(config)
  const b = avatarBounds(px)
  return (
    <svg width={b.w * size} height={b.h * size} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      {px.map(([x, y, c]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />
      ))}
    </svg>
  )
}

/** ภาพของแถมจากไข่: อุปกรณ์ (เฉพาะตัวของ) · ชุดพิเศษ (ใส่บนตัวละครเริ่มต้น) · ตัวละครลึกลับ */
export function ItemArt({ id, size = 4 }: { id: string; size?: number }) {
  const it = eggItemById(id)
  if (!it) return null
  const key = itemKey(id)
  if (it.kind === 'secret') return <CharacterArt id={key} size={size} />
  if (it.kind === 'outfit') return <AvatarArt config={{ ...DEFAULT_AVATAR, job: key as AvatarConfig['job'] }} size={Math.max(2, size - 2)} label={it.name} />
  const px = it.kind === 'hand' ? HAND_ITEMS[key as HandItem].px : OFFHAND_ITEMS[key as OffhandItem].px
  const xs = px.map((p) => p[0])
  const ys = px.map((p) => p[1])
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0 + 1
  const h = Math.max(...ys) - y0 + 1
  const s = Math.max(2, Math.floor((size * 10) / Math.max(w, h)))
  return (
    <svg width={w * s} height={h * s} viewBox={`${x0} ${y0} ${w} ${h}`} shapeRendering="crispEdges" role="img" aria-label={it.name}>
      {px.map(([x, y, c]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />
      ))}
    </svg>
  )
}
