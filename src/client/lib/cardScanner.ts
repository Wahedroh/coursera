import { answerFromAngle, parseCard } from '../../shared/cardgame'

type Reader = typeof import('zxing-wasm/reader')
let loading: Promise<Reader> | null = null

/** โหลดตัวอ่าน QR (WebAssembly ~1 MB) ครั้งแรกที่ใช้ — ไฟล์ wasm มาจากเว็บเราเอง ไม่พึ่ง CDN */
export function loadReader(): Promise<Reader> {
  loading ??= (async () => {
    const [m, { default: wasmUrl }] = await Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
    m.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }, fireImmediately: true })
    return m
  })()
  return loading
}

export type CardScan = { zipgradeId: string; answer: number; corners: { x: number; y: number }[] }

/** อ่านการ์ดทั้งหมดในภาพ: ZipGrade ID + ด้านที่หันขึ้น (A–D) + มุมทั้ง 4 (ใช้วาดกรอบ) */
export async function scanImage(img: ImageData): Promise<CardScan[]> {
  const z = await loadReader()
  const res = await z.readBarcodes(img, { formats: ['QRCode'], maxNumberOfSymbols: 80, tryHarder: true })
  const out: CardScan[] = []
  for (const r of res) {
    const id = parseCard(r.text)
    if (!id || !r.isValid) continue
    const { topLeft: a, topRight: b, bottomRight: c, bottomLeft: d } = r.position
    out.push({ zipgradeId: id, answer: answerFromAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI), corners: [a, b, c, d] })
  }
  return out
}
