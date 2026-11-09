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
  // ซีซัน 2
  fox: ['k........k', 'kbk....kbk', 'kbbkkkkbbk', '.kbbbbbbk.', 'kbbkbbkbbk', 'kwwbbbbwwk', '.kwwkkwwk.', '..kwwwwk..', '..kbbbbk..', '...kkkk...'],
  penguin: ['...kkkk...', '..kbbbbk..', '.kbwbbwbk.', '.kbkbbkbk.', '.kbbyybbk.', 'kbbccccbbk', 'kbccccccbk', 'kbccccccbk', '.kbccccbk.', '..yy..yy..'],
  bunny: ['.kk....kk.', '.kpk..kpk.', '.kpk..kpk.', '..kbkkbk..', '.kbbbbbbk.', 'kbbkbbkbbk', 'kbpbbbbpbk', 'kbbbkkbbbk', '.kbbbbbbk.', '..kkkkkk..'],
  bear: ['.kk....kk.', 'kbbk..kbbk', 'kbbkkkkbbk', '.kbbbbbbk.', 'kbbkbbkbbk', 'kbbbbbbbbk', 'kbcckkccbk', 'kbbccccbbk', '.kbbbbbbk.', '..kkkkkk..'],
} as const

export type Character = { id: string; name: string; rarity: Rarity; shape: keyof typeof SHAPES; palette: Record<string, string>; season: number }

const p = (k: string, b: string, extra: Partial<Record<'w' | 'y' | 'c' | 'p', string>> = {}) => ({ k, b, w: '#ffffff', y: '#F2B544', c: '#CFE8D9', p: '#F7B5C0', ...extra })

const SEASON_1: Omit<Character, 'season'>[] = [
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

const SEASON_2: Omit<Character, 'season'>[] = [
  { id: 'fox-orange', name: 'จิ้งจอกส้ม', rarity: 'common', shape: 'fox', palette: p('#4a2410', '#E8782E') },
  { id: 'fox-snow', name: 'จิ้งจอกหิมะ', rarity: 'common', shape: 'fox', palette: p('#5b6670', '#E9EEF2', { w: '#FFFFFF' }) },
  { id: 'penguin-baby', name: 'เพนกวินน้อย', rarity: 'common', shape: 'penguin', palette: p('#111418', '#2E3440', { c: '#FFFFFF', y: '#F29A3C' }) },
  { id: 'penguin-sky', name: 'เพนกวินฟ้า', rarity: 'common', shape: 'penguin', palette: p('#13314f', '#4A90C8', { c: '#F4FAFF', y: '#F2B544' }) },
  { id: 'bunny-white', name: 'กระต่ายขาว', rarity: 'common', shape: 'bunny', palette: p('#7b6f62', '#FFFFFF', { p: '#F7B5C0' }) },
  { id: 'bunny-choco', name: 'กระต่ายช็อกโก', rarity: 'common', shape: 'bunny', palette: p('#2e1a0e', '#8A5A36', { p: '#E8A4A0' }) },
  { id: 'bear-brown', name: 'หมีน้ำตาล', rarity: 'common', shape: 'bear', palette: p('#3b2414', '#A86B3C', { c: '#F1D9B8' }) },
  { id: 'bear-polar', name: 'หมีขั้วโลก', rarity: 'common', shape: 'bear', palette: p('#5d6a72', '#F7F9FA', { c: '#FFFFFF' }) },
  { id: 'bear-panda', name: 'แพนด้า', rarity: 'rare', shape: 'bear', palette: p('#111111', '#FFFFFF', { c: '#E6E6E6' }) },
  { id: 'penguin-emperor', name: 'เพนกวินจักรพรรดิ', rarity: 'rare', shape: 'penguin', palette: p('#0e1626', '#34405A', { c: '#FFF6D6', y: '#FFB300' }) },
  { id: 'bunny-sakura', name: 'กระต่ายซากุระ', rarity: 'rare', shape: 'bunny', palette: p('#8a3a5a', '#FFD6E5', { p: '#F27BA6' }) },
  { id: 'fox-night', name: 'จิ้งจอกราตรี', rarity: 'rare', shape: 'fox', palette: p('#0d1330', '#3D4C9E', { w: '#C9D3FF' }) },
  { id: 'fox-fire', name: 'จิ้งจอกเพลิง', rarity: 'epic', shape: 'fox', palette: p('#5c1414', '#E8452C', { w: '#FFD27A' }) },
  { id: 'bear-galaxy', name: 'หมีกาแล็กซี', rarity: 'epic', shape: 'bear', palette: p('#1b1036', '#7B5CD6', { c: '#C9B8FF' }) },
  { id: 'bunny-moon', name: 'กระต่ายจันทรา', rarity: 'epic', shape: 'bunny', palette: p('#3a2f6b', '#E7E0FF', { p: '#F2B544' }) },
  { id: 'penguin-gold', name: 'เพนกวินทองคำ', rarity: 'legendary', shape: 'penguin', palette: p('#6b4a00', '#F2B544', { c: '#FFF4C2', y: '#FFFDF0' }) },
]

export const SEASONS = [
  { season: 1, name: 'ซีซัน 1 · สัตว์วิเศษ' },
  { season: 2, name: 'ซีซัน 2 · เพื่อนป่าหิมะ' },
] as const
export const SEASON_COUNT = SEASONS.length

export const CHARACTERS: Character[] = [...SEASON_1.map((c) => ({ ...c, season: 1 })), ...SEASON_2.map((c) => ({ ...c, season: 2 }))]
/** ตัวละครของซีซัน (เกินจำนวนซีซันที่มี = ซีซันสุดท้าย) */
export const charactersOfSeason = (season: number) => {
  const s = Math.min(Math.max(1, season), SEASON_COUNT)
  return CHARACTERS.filter((c) => c.season === s)
}

export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id)
export const shapeRows = (c: Character) => SHAPES[c.shape]
