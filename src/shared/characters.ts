export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export const RARITY_LABEL: Record<Rarity, string> = { common: 'ธรรมดา', rare: 'หายาก', epic: 'หายากมาก', legendary: 'ตำนาน' }
/** น้ำหนักสุ่มความหายาก (รวม 100) */
export const RARITY_WEIGHTS: [Rarity, number][] = [
  ['common', 60],
  ['rare', 25],
  ['epic', 12],
  ['legendary', 3],
]

const SHAPES = {
  owl: ['..k....k..', '..kk..kk..', '.kbbbbbbk.', 'kbwwbbwwbk', 'kbwkbbwkbk', 'kbwwbbwwbk', '.kbbyybbk.', '.kbccccbk.', '.kbccccbk.', '..kbbbbk..'],
  cat: ['k......k..', 'kbk....kbk', 'kbbbk.kbbk', '.kbbbbbbbk', 'kbwkbbwkbk', 'kbbbppbbbk', 'kbbbbbbbbk', '.kbbbbbbbk', '..kbkkbkk.', '..........'],
  dragon: ['..kk..kk..', '.kbbkkbbk.', '.kbbbbbbk.', 'kbwkbbwkbk', 'kbbbbbbbbk', 'kbbyyyybbk', '.kbbbbbbk.', 'kkbbbbbbkk', 'k.kbbbbk.k', '..kk..kk..'],
  unicorn: ['....y.....', '....yy....', '..kkkkk...', '.kbbbbbk..', 'kbbkbbbbk.', 'kbbbbbpbk.', '.kbbbbbk..', '..kpbpk...', '.kbbbbbk..', '..k..k....'],
} as const

export type Character = { id: string; name: string; rarity: Rarity; shape: keyof typeof SHAPES; palette: Record<string, string> }

const p = (k: string, b: string, extra: Partial<Record<'w' | 'y' | 'c' | 'p', string>> = {}) => ({ k, b, w: '#ffffff', y: '#F2B544', c: '#CFE8D9', p: '#F7B5C0', ...extra })

export const CHARACTERS: Character[] = [
  { id: 'owl-green', name: 'ฮูกเขียว', rarity: 'common', shape: 'owl', palette: p('#1E2A26', '#2E7D5B') },
  { id: 'owl-brown', name: 'ฮูกน้ำตาล', rarity: 'common', shape: 'owl', palette: p('#3b2a1a', '#9C6B3F', { c: '#F1DEC6' }) },
  { id: 'cat-orange', name: 'แมวส้ม', rarity: 'common', shape: 'cat', palette: p('#3b2a1a', '#F29A3C') },
  { id: 'cat-gray', name: 'แมวเทา', rarity: 'common', shape: 'cat', palette: p('#2b2b2b', '#9AA3A7') },
  { id: 'cat-black', name: 'แมวดำ', rarity: 'common', shape: 'cat', palette: p('#000000', '#3A3A44', { p: '#E57A9A' }) },
  { id: 'dragon-green', name: 'มังกรใบไม้', rarity: 'common', shape: 'dragon', palette: p('#163d27', '#5CB97B') },
  { id: 'unicorn-white', name: 'ม้าน้อยขาว', rarity: 'common', shape: 'unicorn', palette: p('#7b6f62', '#FFFFFF') },
  { id: 'owl-snow', name: 'ฮูกหิมะ', rarity: 'common', shape: 'owl', palette: p('#45535b', '#E8EEF2', { c: '#ffffff' }) },
  { id: 'dragon-blue', name: 'มังกรฟ้า', rarity: 'rare', shape: 'dragon', palette: p('#1b2b55', '#5B8DEF', { y: '#FFE08A' }) },
  { id: 'cat-calico', name: 'แมวสามสี', rarity: 'rare', shape: 'cat', palette: p('#3b2a1a', '#F7E3C8', { p: '#F29A3C' }) },
  { id: 'owl-night', name: 'ฮูกราตรี', rarity: 'rare', shape: 'owl', palette: p('#0d1330', '#3D4C9E', { y: '#FFE08A', c: '#9FB0F2' }) },
  { id: 'unicorn-mint', name: 'ยูนิคอร์นมินต์', rarity: 'rare', shape: 'unicorn', palette: p('#2a6b56', '#C9F2E3', { p: '#7ED6B7' }) },
  { id: 'unicorn-pink', name: 'ยูนิคอร์นชมพู', rarity: 'epic', shape: 'unicorn', palette: p('#5a3fb0', '#FFFFFF', { p: '#F49AC1' }) },
  { id: 'dragon-fire', name: 'มังกรไฟ', rarity: 'epic', shape: 'dragon', palette: p('#5c1414', '#E85D3C', { y: '#FFD27A' }) },
  { id: 'cat-galaxy', name: 'แมวกาแล็กซี', rarity: 'epic', shape: 'cat', palette: p('#1b1036', '#7B5CD6', { p: '#F2B544' }) },
  { id: 'dragon-gold', name: 'มังกรทองคำ', rarity: 'legendary', shape: 'dragon', palette: p('#6b4a00', '#F2B544', { y: '#FFF4C2', w: '#FFFDF0' }) },
]

export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id)
export const shapeRows = (c: Character) => SHAPES[c.shape]
