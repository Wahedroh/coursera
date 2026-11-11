import { expect, test, type Browser } from '@playwright/test'

async function studentPage(browser: Browser) {
  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return s
}

test('ครูดูกราฟห้องเรียน: เทียบห้อง · มาเรียนรายสัปดาห์ · ส่งงาน · คะแนนสอบ (สลับเป็นตารางได้)', async ({ page }) => {
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.getByLabel('เลือกห้องสำหรับเมนู').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await page.getByRole('link', { name: 'กราฟ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'กราฟห้องเรียน' })).toBeVisible()
  await expect(page.getByLabel('ห้อง')).toHaveValue(/.+/)
  await expect(page.getByLabel('ห้อง').locator('option:checked')).toHaveText('โรงเรียนทดสอบ ชั้น 1')
  const box = page.getByTestId('class-insights')
  for (const t of ['มาเรียนรายสัปดาห์ (%)', /การส่งงานแต่ละชิ้น/, /คะแนนสอบเฉลี่ยแต่ละครั้ง/]) await expect(box.getByText(t)).toBeVisible()
  await expect(page.getByTestId('compare-table')).toContainText('โรงเรียนทดสอบ ชั้น 1')
  // ชี้แท่งแรกของกราฟส่งงาน → เห็นรายละเอียด
  const asg = box.getByRole('figure', { name: /การส่งงานแต่ละชิ้น/ })
  await asg.getByRole('button', { name: '1', exact: true }).click()
  await expect(asg.getByRole('tooltip')).toContainText('ตรงเวลา')
  await asg.getByRole('button', { name: 'ดูเป็นตาราง' }).click()
  await expect(asg.getByRole('columnheader', { name: 'ยังไม่ส่ง' })).toBeVisible()
})

test('นักเรียน: เหรียญตราในหน้าตัวละคร · การ์ดติดตั้งแอปและเปิดแจ้งเตือน', async ({ browser }) => {
  const s = await studentPage(browser)
  await expect(s.getByTestId('app-setup')).toContainText('ใช้เป็นแอปในมือถือ')
  await s.getByRole('link', { name: '⭐ ตัวละครและแต้มของฉัน' }).click()
  const b = s.getByTestId('badges')
  await expect(b.getByRole('heading', { name: /🏅 เหรียญตรา \(\d\/9\)/ })).toBeVisible()
  for (const t of ['ขาประจำ', 'ตรงเวลาเสมอ', 'นักสะสม', 'ครบชุด']) await expect(b.getByText(t, { exact: true })).toBeVisible()
  const res = await s.request.get('/manifest.webmanifest')
  expect((await res.json()).short_name).toBe('ผู้ช่วยครู')
  expect((await s.request.get('/sw.js')).ok()).toBe(true)
})

test('ครูลบงานที่มีนักเรียนส่งแล้ว: ยืนยัน 2 ครั้ง แล้วงานและงานที่ส่งหายไป', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByRole('link', { name: 'โรงเรียนทดสอบ ชั้น 1', exact: true }).click()
  const classId = new URL(t.url()).pathname.split('/').pop()!
  const { ids } = await (
    await t.request.post('/api/teacher/assignments', { data: { title: 'งานจะลบทิ้ง', instructions: '', attachmentKeys: [], dueAt: null, maxScore: 10, submitMode: 'text', classIds: [classId] } })
  ).json()
  const s = await studentPage(browser)
  expect((await s.request.put(`/api/student/assignments/${ids[0]}/submission`, { data: { text: 'ตอบ', imageKeys: [], clientRequestId: 'e2e-del' } })).ok()).toBe(true)

  await t.goto(`/teacher/assignments/${ids[0]}/edit`)
  const dialogs: string[] = []
  t.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.accept()
  })
  await t.getByRole('button', { name: 'ลบงาน' }).click()
  await expect(t.getByText('ลบงานแล้ว พร้อมงานที่นักเรียนส่ง 1 คน')).toBeVisible()
  expect(dialogs[0]).toBe('ลบงานนี้?')
  expect(dialogs[1]).toContain('มีนักเรียนส่งงานนี้แล้ว 1 คน')
  await expect(t.getByText('งานจะลบทิ้ง')).toHaveCount(0)
  await s.goto('/me')
  await expect(s.getByText('งานจะลบทิ้ง')).toHaveCount(0)
})

test('นักเรียน: กระดิ่งแจ้งเตือนบนหน้าแรก แสดงประกาศใหม่ เปิดดูแล้วตัวเลขหาย', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByRole('link', { name: 'โรงเรียนทดสอบ ชั้น 1', exact: true }).click()
  const classId = new URL(t.url()).pathname.split('/').pop()!
  await t.request.post('/api/teacher/announcements', { data: { title: 'ประกาศทดสอบกระดิ่ง', body: 'พกเครื่องคิดเลข', pinned: false, expiresOn: null, classIds: [classId] } })

  const s = await studentPage(browser)
  const bell = s.getByTestId('notice-bell')
  await expect(bell).toHaveAccessibleName(/ยังไม่อ่าน \d+ รายการ/)
  await bell.click()
  const panel = s.getByTestId('notice-panel')
  await expect(panel.getByText('📢 ประกาศทดสอบกระดิ่ง')).toBeVisible()
  await expect(panel.getByText('พกเครื่องคิดเลข')).toBeVisible()
  await panel.getByRole('button', { name: 'ปิด' }).click()
  await s.reload()
  await expect(s.getByTestId('notice-bell')).toHaveAccessibleName('การแจ้งเตือน')
})

test('ปฏิทิน: ครูเพิ่มวันสอบ (พร้อมรายการคะแนน) → นักเรียนเห็นในปฏิทินและได้แจ้งเตือน', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByLabel('เลือกห้องสำหรับเมนู').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await t.locator('a[href*="/teacher/calendar?class="]').click()
  await expect(t.getByRole('heading', { name: 'ปฏิทิน', exact: true })).toBeVisible()
  await expect(t.getByLabel('ชั้น 1')).toBeChecked()
  await t.getByRole('button', { name: 'สอบ', exact: true }).click()
  await t.getByLabel('ชื่อ', { exact: true }).fill('สอบย่อยปฏิทิน')
  await t.getByLabel('คาบ / เวลา (ไม่บังคับ)').fill('คาบ 3')
  await t.getByLabel('สร้างรายการคะแนนสอบด้วย').check()
  await t.getByRole('button', { name: /^เพิ่มลงปฏิทิน/ }).click()
  await expect(t.getByText(/เพิ่ม "สอบย่อยปฏิทิน" 1 ห้องแล้ว พร้อมรายการคะแนนสอบ/)).toBeVisible()
  await expect(t.getByTestId('calendar-list').getByText('สอบย่อยปฏิทิน')).toBeVisible()

  const s = await studentPage(browser)
  await s.getByRole('link', { name: '📅 ปฏิทิน' }).click()
  await expect(s.getByRole('heading', { name: '📅 ปฏิทิน' })).toBeVisible()
  const list = s.getByTestId('calendar-list')
  await expect(list.getByText('สอบย่อยปฏิทิน')).toBeVisible()
  await expect(list.getByText(/คาบ 3/)).toBeVisible()
  await s.goto('/me')
  await s.getByTestId('notice-bell').click()
  await expect(s.getByTestId('notice-panel').getByText(/📅 สอบ: สอบย่อยปฏิทิน/)).toBeVisible()
})

test('เกมการ์ด QR: สร้างชุดคำถาม → เริ่มเกม → กล้องมือถือครูอ่านการ์ด 3 ใบ (A/B/C ตามด้านที่หันขึ้น) → เฉลย → จบเกม', async ({ browser }, testInfo) => {
  const { chromium } = await import('@playwright/test')
  const { execFileSync } = await import('node:child_process')
  const qrcode = (await import('qrcode-generator')).default

  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByRole('link', { name: 'เกมการ์ด QR' }).click()
  await t.getByRole('button', { name: '+ สร้างชุดคำถาม' }).click()
  await t.getByLabel('ชื่อชุด').fill('ทบทวนนิวตัน')
  await t.getByLabel('คำถามข้อ 1', { exact: true }).fill('แรงลัพธ์ศูนย์ วัตถุจะ?')
  for (const [k, c] of ['คงสภาพเดิม', 'เร่งขึ้น', 'ช้าลง', 'หมุน'].entries()) await t.getByLabel(`ข้อ 1 ตัวเลือก ${'ABCD'[k]}`, { exact: true }).fill(c)
  await t.getByRole('button', { name: 'บันทึกชุดคำถาม' }).click()
  await t.getByLabel('ห้องที่เล่น').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await t.getByLabel('ห้องที่พิมพ์การ์ด').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  // หน้าพิมพ์การ์ด
  await t.getByRole('link', { name: 'เปิดหน้าพิมพ์การ์ด' }).click()
  await expect(t.getByTestId('qr-card').first()).toBeVisible()
  const classId = new URL(t.url()).pathname.split('/')[3]
  const cards = await (await t.request.get(`/api/teacher/classes/${classId}/cards`)).json()
  await t.goBack()
  await t.getByLabel('ห้องที่เล่น').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await t.getByRole('button', { name: 'เริ่มเกม' }).click()
  await expect(t.getByTestId('game-question')).toHaveText('แรงลัพธ์ศูนย์ วัตถุจะ?')
  const gameId = new URL(t.url()).pathname.split('/').pop()!

  // ภาพจากกล้อง: การ์ด 3 ใบ หมุน 0° (A) · ขอบขวาขึ้น (B) · กลับหัว (C)
  const three = cards.students.slice(0, 3) as { id: string; zipgradeId: string }[]
  const svg = (text: string) => {
    const q = qrcode(0, 'L')
    q.addData(text, 'Alphanumeric')
    q.make()
    const n = q.getModuleCount()
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`
    return `<svg viewBox="0 0 ${n + 4} ${n + 4}" width="230" height="230" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}"/></svg>`
  }
  const img = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false })).newPage()
  await img.setContent(
    `<body style="margin:0;background:#8a8f8c;display:flex;gap:120px;align-items:center;justify-content:center;height:720px">${three
      .map((s, k) => `<div style="transform:rotate(${[0, -90, 180][k]}deg)">${svg(`CC:${s.zipgradeId.toUpperCase()}`)}</div>`)
      .join('')}</body>`,
  )
  // Chrome อ่านไฟล์กล้องปลอมจาก path ภาษาไทยไม่ได้ → ใช้โฟลเดอร์ชั่วคราวของระบบ
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const base = join(tmpdir(), `cc-cards-${testInfo.workerIndex}-${Date.now()}`)
  const png = `${base}.png`
  const y4m = `${base}.y4m`
  await img.screenshot({ path: png })
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', png, '-t', '1', '-r', '5', '-pix_fmt', 'yuv420p', y4m])

  const cam = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] })
  try {
    const ctx = await cam.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 412, height: 900 }, permissions: ['camera'] })
    await ctx.addCookies((await t.context().cookies()).map((c) => ({ ...c })))
    const phone = await ctx.newPage()
    await phone.goto(`/teacher/card-games/${gameId}/scan`)
    await expect(phone.getByTestId('scan-status')).toContainText('สแกนแล้ว 3/', { timeout: 30_000 })
    // ระบบได้รับคำตอบ
    await expect
      .poll(async () => {
        const s = await (await t.request.get(`/api/teacher/card-games/${gameId}`)).json()
        return three.map((x) => s.answers[x.id])
      })
      .toEqual([0, 1, 2])
    await expect(t.getByTestId('scanned-count')).toContainText('3 /')
    await phone.getByRole('button', { name: 'เฉลย' }).click()
  } finally {
    await cam.close()
  }
  await expect(t.getByTestId('game-reveal')).toContainText('ตอบถูก 1 / 3 คน')
  await t.getByRole('button', { name: 'จบเกม' }).click()
  await t.getByRole('dialog', { name: 'จบเกม' }).getByRole('button', { name: 'จบเกม' }).click()
  await expect(t.getByTestId('game-results')).toBeVisible()
  await expect(t.getByTestId('game-results')).toContainText('ถูก 1/1')
  await expect(t.getByText('✓ บันทึกเป็นคะแนนเก็บแล้ว')).toBeVisible()
})

test('เกมการ์ด: ครูใส่รูปโจทย์ (ตัวเลือกอยู่ในรูป) → จอหน้าห้องแสดงรูป', async ({ page }) => {
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.getByRole('link', { name: 'เกมการ์ด QR' }).click()
  await page.getByRole('button', { name: '+ สร้างชุดคำถาม' }).click()
  await page.getByLabel('ชื่อชุด').fill('โจทย์จากหนังสือ')
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 120 } })
  await page.getByLabel('รูปโจทย์ข้อ 1', { exact: true }).setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('img', { name: 'รูปโจทย์ข้อ 1' })).toBeVisible()
  await page.getByLabel('ข้อ 1 คำตอบที่ถูกคือ C').check()
  await page.getByRole('button', { name: 'บันทึกชุดคำถาม' }).click()
  await page.getByLabel('ชุดคำถาม').selectOption({ label: 'โจทย์จากหนังสือ (1 ข้อ)' })
  await page.getByLabel('ห้องที่เล่น').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await page.getByRole('button', { name: 'เริ่มเกม' }).click()
  await expect(page.getByRole('img', { name: 'รูปโจทย์ข้อ 1' })).toBeVisible()
  await expect(page.getByText('ตัวเลือก C (ในรูป)')).toBeVisible()
})

test('เกมการ์ด: ตั้งเวลาข้อละ 10 วินาที → จอนับถอยหลัง → หมดเวลาแล้วเฉลยเอง', async ({ page }) => {
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.getByRole('link', { name: 'เกมการ์ด QR' }).click()
  await page.getByRole('button', { name: '+ สร้างชุดคำถาม' }).click()
  await page.getByLabel('ชื่อชุด').fill('จับเวลา 10 วิ')
  await page.getByLabel('คำถามข้อ 1', { exact: true }).fill('1+1=?')
  await page.getByLabel('ข้อ 1 ตัวเลือก A', { exact: true }).fill('2')
  await page.getByLabel('ข้อ 1 ตัวเลือก B', { exact: true }).fill('3')
  await page.getByLabel('ข้อ 1 ตัวเลือก C', { exact: true }).fill('4')
  await page.getByLabel('ข้อ 1 ตัวเลือก D', { exact: true }).fill('5')
  await page.getByLabel('ตั้งเวลาทุกข้อ').selectOption('10')
  await expect(page.getByLabel('เวลาตอบข้อ 1')).toHaveValue('10')
  await page.getByRole('button', { name: 'บันทึกชุดคำถาม' }).click()
  await page.getByLabel('ชุดคำถาม').selectOption({ label: 'จับเวลา 10 วิ (1 ข้อ)' })
  await page.getByLabel('ห้องที่เล่น').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await page.getByRole('button', { name: 'เริ่มเกม' }).click()
  await expect(page.getByTestId('countdown')).toHaveAccessibleName(/เหลือ \d+ วินาที/)
  await expect(page.getByTestId('game-reveal')).toBeVisible({ timeout: 20_000 })
})

test('วิเคราะห์รายคน + ใบสรุปผล: ครูเขียนโน้ต → เปิดให้พิมพ์ → นักเรียนดาวน์โหลด PDF', async ({ browser }) => {
  const t = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByLabel('เลือกห้องสำหรับเมนู').selectOption({ label: 'โรงเรียนทดสอบ ชั้น 1' })
  await t.getByRole('link', { name: 'วิเคราะห์รายคน', exact: true }).click()
  await expect(t.getByRole('heading', { name: '📋 วิเคราะห์นักเรียนรายคน' })).toBeVisible()
  await expect(t.getByTestId('analysis-table')).toContainText('มานี')
  await t.getByTestId('analysis-table').getByRole('button', { name: 'มานี' }).click()
  const detail = t.getByTestId('student-detail')
  await expect(detail.getByRole('heading', { name: /มานี/ })).toBeVisible()
  await detail.getByLabel(/โน้ตของครู/).fill('ตั้งใจเรียนดี ฝึกโจทย์ประยุกต์เพิ่ม')
  await detail.getByRole('button', { name: 'บันทึกโน้ต' }).click()
  await expect(detail.getByText('✓ บันทึกแล้ว')).toBeVisible()

  await t.getByRole('link', { name: '📄 ใบสรุปผล' }).click()
  await expect(t.getByTestId('report-sheet').first()).toBeVisible()
  t.once('dialog', (d) => void d.accept())
  await t.getByLabel('เปิดให้นักเรียนดาวน์โหลด').click()
  await expect(t.getByText('เปิดให้นักเรียนดาวน์โหลดแล้ว')).toBeVisible()

  const s = await studentPage(browser)
  await s.getByTestId('report-ready').click()
  const sheet = s.getByTestId('report-sheet')
  await expect(sheet).toContainText('ใบสรุปผลการเรียน')
  await expect(sheet).toContainText('มานี')
  await expect(sheet).toContainText('ตั้งใจเรียนดี ฝึกโจทย์ประยุกต์เพิ่ม')
  await expect(sheet.getByRole('img', { name: /ตัวละครของ/ })).toBeVisible()
  const [dl] = await Promise.all([s.waitForEvent('download', { timeout: 30_000 }), s.getByRole('button', { name: '⬇️ ดาวน์โหลด PDF (A4)' }).click()])
  const path = await dl.path()
  const { readFileSync } = await import('node:fs')
  const buf = readFileSync(path!)
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(buf.length).toBeGreaterThan(20_000)
})

test('นักเรียน: ป้ายสตรีค 🔥 บนหน้าแรก · ทำภารกิจครบแล้วหมุนวงล้อได้ครั้งเดียว', async ({ browser }) => {
  const s = await studentPage(browser)
  await expect(s.getByTestId('streak')).toContainText(/มาเรียนต่อเนื่อง \d+ คาบ/)
  // ทำภารกิจให้ครบผ่าน API (มาเรียน 3 · ส่งงาน · ดูคลิป) แล้วกดรับ
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByRole('link', { name: 'โรงเรียนทดสอบ ชั้น 1', exact: true }).click()
  const classId = new URL(t.url()).pathname.split('/').pop()!
  const q = await (await s.request.get('/api/student/quests')).json()
  const need = q.quests.filter((x: { claimed: boolean; progress: number; need: number }) => !x.claimed && x.progress < x.need).map((x: { id: string }) => x.id)
  if (need.includes('submit')) {
    const { ids } = await (
      await t.request.post('/api/teacher/assignments', { data: { title: 'งานภารกิจ', instructions: '', attachmentKeys: [], dueAt: Date.now() + 86400_000, maxScore: 5, submitMode: 'text', classIds: [classId] } })
    ).json()
    await s.request.put(`/api/student/assignments/${ids[0]}/submission`, { data: { text: 'ตอบ', imageKeys: [], clientRequestId: 'quest-e2e' } })
  }
  if (need.includes('video')) {
    const { ids } = await (await t.request.post('/api/teacher/videos', { data: { title: 'คลิปภารกิจ', description: '', url: 'https://youtu.be/dQw4w9WgXcQ', classIds: [classId] } })).json()
    await s.request.post(`/api/student/videos/${ids[0]}/watched`, { data: { watchedSeconds: 90, durationSeconds: 100 } })
  }
  if (need.includes('attend')) {
    // เปิดเช็กชื่อวันจันทร์ถึงวันนี้ของสัปดาห์นี้ (ทุกคนมาเรียนเป็นค่าเริ่มต้น)
    const now = Date.now() + 7 * 3600_000
    const dow = (new Date(now).getUTCDay() + 6) % 7
    test.skip(dow < 2, 'ต้นสัปดาห์ยังมีไม่ถึง 3 วันให้เช็กชื่อ')
    for (let i = dow; i >= 0; i--) await t.request.post(`/api/teacher/classes/${classId}/attendance`, { data: { date: new Date(now - i * 86400_000).toISOString().slice(0, 10) } })
  }
  for (const id of ['attend', 'submit', 'video']) await s.request.post(`/api/student/quests/${id}/claim`, { data: {} })
  await s.reload()
  await s.getByTestId('wheel-open').click()
  await s.getByRole('dialog', { name: 'วงล้อนำโชค' }).getByRole('button', { name: 'หมุนเลย!' }).click()
  await expect(s.getByTestId('wheel-result')).toContainText(/ได้ \+\d+ EXP/, { timeout: 8000 })
  await s.getByRole('button', { name: 'ปิด' }).click()
  await expect(s.getByText(/สัปดาห์นี้หมุนวงล้อแล้ว ได้ \+\d+ EXP/)).toBeVisible()
  await expect(s.getByTestId('wheel-open')).toHaveCount(0)
})
