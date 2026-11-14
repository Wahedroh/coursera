import { expect, test, type Browser, type Page } from '@playwright/test'

async function teacherPage(browser: Browser): Promise<Page> {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(t.getByRole('heading', { name: 'เมนูห้องเรียน' })).toBeVisible()
  return t
}
const hhmm = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(11, 16)
const WEEKDAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']

test('ตารางสอน: เพิ่มคาบที่กำลังสอน → หน้าแรกขึ้น “กำลังสอน” พร้อมปุ่มลัด · ลบคาบได้', async ({ browser }) => {
  const now = Date.now()
  const start = hhmm(now - 5 * 60_000)
  const end = hhmm(now + 40 * 60_000)
  test.skip(start >= end, 'ใกล้เที่ยงคืน')
  const t = await teacherPage(browser)
  await t.getByRole('link', { name: 'ตารางสอน', exact: true }).click()
  await expect(t.getByRole('heading', { name: 'ตารางสอน' })).toBeVisible()
  for (const d of ['จันทร์', 'ศุกร์', 'เสาร์', 'อาทิตย์']) await expect(t.getByTestId('timetable-grid').getByText(d, { exact: true })).toBeVisible()
  await t.getByLabel('ห้องของคาบ').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await t.getByLabel('วันของคาบ').selectOption({ label: WEEKDAY[new Date(now + 7 * 3600_000).getUTCDay()] })
  await t.getByLabel('เวลาเริ่มคาบ').fill(start)
  await t.getByLabel('เวลาจบคาบ').fill(end)
  await t.getByRole('button', { name: '+ เพิ่มคาบ' }).click()
  await expect(t.getByText(/เพิ่มคาบ โรงเรียนทดสอบ ชั้น 1/)).toBeVisible()
  await expect(t.getByTestId('timetable-grid')).toContainText('โรงเรียนทดสอบ ชั้น 1')

  await t.getByRole('link', { name: 'หน้าแรก' }).click()
  const card = t.getByTestId('now-card')
  await expect(card).toContainText('กำลังสอน')
  await expect(card).toContainText('โรงเรียนทดสอบ ชั้น 1')
  // ยืนยันการสอน (เซลฟี + พิกัด) → ลิงก์ของครู · กดยืนยันแล้ว
  const selfie = card.getByTestId('selfie-row')
  await expect(selfie.getByRole('link', { name: /ยืนยันการสอน/ })).toHaveAttribute('href', 'https://change-classroom1.base44.app/')
  await selfie.getByRole('button', { name: 'ยืนยันแล้ว ✓' }).click()
  await expect(selfie).toContainText('ยืนยันการสอนคาบนี้แล้ว')
  await t.reload()
  await expect(t.getByTestId('selfie-row')).toContainText('ยืนยันการสอนคาบนี้แล้ว')
  await card.getByRole('link', { name: /อัปที่จด/ }).click()
  await expect(t.getByRole('radio', { name: /เอกสารที่จดในห้อง/ })).toBeChecked()

  // ลบคาบ (ไม่ให้กระทบเทสต์อื่น)
  await t.goto('/teacher/timetable')
  t.on('dialog', (d) => d.accept())
  await t.getByTestId('timetable-grid').getByRole('button', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await expect(t.getByTestId('timetable-grid')).not.toContainText('โรงเรียนทดสอบ ชั้น 1')
})

test('สร้างงานแบบร่าง → นักเรียนไม่เห็น → หน้า “รอเผยแพร่” กดเผยแพร่ → นักเรียนเห็น', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.goto('/teacher/assignments/new')
  await t.getByLabel('ชื่องาน').fill('งานร่าง E2E')
  await t.getByLabel('โรงเรียนทดสอบ ชั้น 1').check()
  await t.getByTestId('publish-picker').getByText('เก็บเป็นร่าง').click()
  await t.getByRole('button', { name: 'สร้างงาน', exact: true }).click()
  await expect(t.getByText(/เก็บเป็นร่าง/).first()).toBeVisible()

  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByText(/สวัสดี/)).toBeVisible()
  expect(JSON.stringify(await (await s.request.get('/api/student/assignments')).json())).not.toContain('งานร่าง E2E')

  await t.getByRole('link', { name: 'รอเผยแพร่', exact: true }).click()
  const row = t.getByTestId('scheduled-list').locator('div', { hasText: 'งานร่าง E2E' }).first()
  await expect(row).toContainText('ร่าง')
  await row.getByRole('button', { name: 'เผยแพร่ตอนนี้' }).click()
  await expect(t.getByText('เผยแพร่ "งานร่าง E2E" แล้ว')).toBeVisible()
  expect(JSON.stringify(await (await s.request.get('/api/student/assignments')).json())).toContain('งานร่าง E2E')
  // เก็บกวาด
  const list = await (await t.request.get('/api/teacher/library?type=assignment')).json()
  const id = list.find((x: { title: string }) => x.title === 'งานร่าง E2E').latestId
  await t.request.delete(`/api/teacher/assignments/${id}?force=1`)
})

test('คัดลอกคลิปไปห้องอื่นจากปุ่ม ⧉ · คลังของครูคัดลอกหลายห้อง', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.goto('/teacher/menu/videos')
  await t.getByRole('link', { name: 'คลิปย้อนหลัง โรงเรียนทดสอบ ชั้น 1' }).click()
  await t.waitForURL(/videos/)
  const first = t.getByRole('button', { name: '⧉ คัดลอก' }).first()
  await first.click()
  const dlg = t.getByRole('dialog')
  await dlg.getByLabel(/คัดลอกไป โรงเรียนตัวอย่าง/).first().check()
  await dlg.getByRole('button', { name: 'คัดลอกไป 1 ห้อง' }).click()
  await expect(t.getByText(/คัดลอกคลิปแล้ว 1 ชิ้น/)).toBeVisible()

  await t.getByRole('link', { name: 'คลังของครู', exact: true }).click()
  await t.getByRole('tab', { name: 'ประกาศ' }).click()
  const lib = t.getByTestId('library-list')
  await expect(lib.getByRole('checkbox').first()).toBeVisible()
  await lib.getByRole('checkbox').first().check()
  await t.getByTestId('class-picker').getByRole('checkbox').first().check()
  await t.getByTestId('publish-picker').getByText('เก็บเป็นร่าง').click()
  await t.getByRole('button', { name: /คัดลอกไป 1 ห้อง/ }).click()
  await expect(t.getByText(/คัดลอกประกาศแล้ว 1 ชิ้น \(รอเผยแพร่ 1\)/)).toBeVisible()
})

test('เอกสารที่จดในห้อง: วางรูปจากคลิปบอร์ด 2 หน้า → รวมเป็น PDF ไฟล์เดียว → นักเรียนเปิดได้', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.goto('/teacher/menu/materials')
  await t.getByRole('link', { name: 'เอกสารเรียน โรงเรียนทดสอบ ชั้น 1' }).click()
  await t.waitForURL(/materials/)
  await t.goto(t.url() + '?kind=notes')
  const zone = t.getByTestId('paste-zone')
  await expect(zone).toBeVisible()
  // จำลองการวางรูปจากคลิปบอร์ด (เหมือนคัดลอกหน้าจาก GoodNotes)
  const paste = (color: string) =>
    zone.evaluate(async (el, c) => {
      const cv = document.createElement('canvas')
      cv.width = 600
      cv.height = 800
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 600, 800)
      const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'))
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, color)
  await paste('#fde68a')
  // ไม่มีรูป (มีแต่ข้อความ) → บอกชนิดข้อมูลที่พบ
  await zone.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'ข้อความ')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(t.getByText(/ไม่พบรูปในคลิปบอร์ด \(พบข้อมูลชนิด: text\/plain\)/)).toBeVisible()
  // รูปที่ฝังมาใน HTML (data URI)
  await zone.evaluate((el) => {
    const cv = document.createElement('canvas')
    cv.width = 300
    cv.height = 400
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#bfdbfe'
    ctx.fillRect(0, 0, 300, 400)
    const dt = new DataTransfer()
    dt.setData('text/html', `<img src="${cv.toDataURL('image/png')}">`)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(t.getByTestId('pasted-pages').getByRole('img')).toHaveCount(2)
  await expect(t.getByLabel('ชื่อเอกสาร')).toHaveValue(/^จดในห้อง /)
  await t.getByLabel('ชื่อเอกสาร').fill('จดบนกระดาน (วาง)')
  await t.getByRole('button', { name: 'อัปโหลด', exact: true }).click()
  await expect(t.getByText(/อัปโหลด "จดบนกระดาน \(วาง\)" แล้ว 1 ห้อง · เอกสารที่จดในห้อง/)).toBeVisible()

  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByText(/สวัสดี/)).toBeVisible()
  const list = await (await s.request.get('/api/student/materials')).json()
  const m = list.find((x: { title: string }) => x.title === 'จดบนกระดาน (วาง)')
  expect(m).toMatchObject({ kind: 'notes', fileName: expect.stringMatching(/\.pdf$/) })
  const res = await s.request.get(`/api/files/${m.fileKey}`)
  expect(res.headers()['content-type']).toBe('application/pdf')
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')
})

test('ลาก PDF จาก GoodNotes หลายครั้ง + รูป → รวมเป็น PDF ไฟล์เดียวตามลำดับ (หน้าครบ)', async ({ browser }) => {
  const { PDFDocument } = await import('pdf-lib')
  const makePdf = async (n: number) => {
    const d = await PDFDocument.create()
    for (let i = 0; i < n; i++) d.addPage([400, 500])
    return Buffer.from(await d.save()).toString('base64')
  }
  const t = await teacherPage(browser)
  await t.goto('/teacher/menu/materials')
  await t.getByRole('link', { name: 'เอกสารเรียน โรงเรียนทดสอบ ชั้น 1' }).click()
  await t.waitForURL(/materials/)
  await t.goto(t.url() + '?kind=notes')
  const zone = t.getByTestId('paste-zone')
  const drop = (b64: string, name: string, type: string) =>
    zone.evaluate(
      (el, [b, n, ty]) => {
        const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], n, { type: ty }))
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      },
      [b64, name, type] as const,
    )
  await drop(await makePdf(2), 'หน้า 1-2.pdf', 'application/pdf')
  await drop(await makePdf(1), 'หน้า 3.pdf', 'application/pdf')
  const png = await t.screenshot({ clip: { x: 0, y: 0, width: 200, height: 260 } })
  await drop(png.toString('base64'), 'รูป.png', 'image/png')
  const strip = t.getByTestId('pasted-pages')
  await expect(strip.getByRole('img')).toHaveCount(3)
  await expect(strip).toContainText('2 หน้า')
  await expect(strip).toContainText('1 หน้า')
  await t.getByLabel('ชื่อเอกสาร').fill('จดในห้อง (ลากหลายไฟล์)')
  await t.getByRole('button', { name: 'อัปโหลด', exact: true }).click()
  await expect(t.getByText(/อัปโหลด "จดในห้อง \(ลากหลายไฟล์\)" แล้ว 1 ห้อง/)).toBeVisible()

  const list = await (await t.request.get(`/api/teacher/classes/${new URL(t.url()).pathname.split('/')[3]}/materials`)).json()
  const m = list.find((x: { title: string }) => x.title === 'จดในห้อง (ลากหลายไฟล์)')
  const res = await t.request.get(`/api/files/${m.fileKey}`)
  expect(res.headers()['content-type']).toBe('application/pdf')
  const doc = await PDFDocument.load(await res.body())
  expect(doc.getPageCount()).toBe(4)
})

test('แจ้งเตือนครู: กระดิ่งในแถบเมนู · ตั้งค่าเปิด/ปิดทีละเรื่องแล้วบันทึก', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.getByRole('link', { name: /^แจ้งเตือน/ }).click()
  await expect(t.getByRole('heading', { name: '🔔 แจ้งเตือน' })).toBeVisible()
  const sw = t.getByRole('switch', { name: '📋 ลืมเช็กชื่อ' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await sw.click()
  await expect(t.getByText('บันทึกแล้ว ✓')).toBeVisible()
  await t.reload()
  await expect(t.getByRole('switch', { name: '📋 ลืมเช็กชื่อ' })).toHaveAttribute('aria-checked', 'false')
  await t.getByRole('switch', { name: '📋 ลืมเช็กชื่อ' }).click()
  await expect(t.getByText('บันทึกแล้ว ✓')).toBeVisible()
  await expect(t.getByLabel('ลิงก์ยืนยันการสอน')).toHaveValue('https://change-classroom1.base44.app/')
})
