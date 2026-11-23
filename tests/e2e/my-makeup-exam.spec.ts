import { teacherNav } from './nav'
import { expect, test, type Browser, type Page } from '@playwright/test'

// กล้องปลอมของ Chromium (คุมสอบด้วยกล้อง) · อนุญาตกล้องอัตโนมัติ
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

// ห้อง "โรงเรียนทดสอบ ชั้น 1": มานี (3, PIN 1357)
async function teacherHome(browser: Browser) {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(t.getByRole('heading', { name: /สวัสดีครับครู/ })).toBeVisible()
  return t
}
async function studentPage(browser: Browser) {
  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return s
}
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

/** รายการสอบวันนี้ มานีขาดสอบ (เผยแพร่แล้ว) + ชุดข้อสอบ 2 ข้อ */
async function setup(t: Page) {
  const schools = await (await t.request.get('/api/teacher/classes')).json()
  const cls = schools.flatMap((s: { classes: { id: string; name: string }[] }) => s.classes).find((c: { name: string }) => c.name === 'โรงเรียนทดสอบ ชั้น 1')
  const { ids } = await (await t.request.post('/api/teacher/score-items', { data: { title: 'สอบย่อยเวกเตอร์', category: 'quiz', maxScore: 10, takenOn: today(), makeupDays: 14, classIds: [cls.id] } })).json()
  const sheet = await (await t.request.get(`/api/teacher/score-items/${ids[0]}`)).json()
  const manee = sheet.students.find((r: { zipgradeId: string }) => r.zipgradeId === '3')
  expect((await t.request.put(`/api/teacher/score-items/${ids[0]}/scores/${manee.id}`, { data: { score: null, absent: true, note: '' } })).ok()).toBe(true)
  expect((await t.request.put(`/api/teacher/score-items/${ids[0]}/published`, { data: { published: true } })).ok()).toBe(true)
  const set = await t.request.post('/api/teacher/exam-sets', {
    data: {
      kind: 'typed',
      title: 'ชุดสอบย้อนหลังเวกเตอร์',
      questions: [
        { q: 'หนึ่งบวกหนึ่ง', choices: ['สอง', 'สาม'], answer: 0 },
        { q: 'สองบวกสอง', choices: ['ห้า', 'สี่'], answer: 1 },
      ],
    },
  })
  expect(set.ok()).toBe(true)
  return { itemId: ids[0] as string, studentId: manee.id as string }
}

test('สอบย้อนหลังออนไลน์: ขาดสอบ → นักเรียนขอ → ครูอนุมัติ (เพดาน 80%) → ใส่รหัส → ทำข้อสอบ (ออกจากหน้าจอถูกบันทึก) → ครูตรวจ → คะแนนลงช่องเดิม', async ({ browser }) => {
  test.setTimeout(120_000)
  const t = await teacherHome(browser)
  const { itemId, studentId } = await setup(t)

  // นักเรียนเห็นการ์ดนับถอยหลังในหน้าคะแนน แล้วส่งคำขอ
  const s = await studentPage(browser)
  await s.goto('/me/scores')
  const card = s.getByTestId('makeup-card')
  await expect(card).toContainText('สอบย่อยเวกเตอร์')
  await expect(card.getByTestId('makeup-countdown')).toContainText(/เหลือเวลาขอสอบ\/สอบ 14 วัน/)
  await card.getByRole('button', { name: 'ขอสอบย้อนหลัง' }).click()
  await card.getByLabel('เหตุผลที่ขอสอบย้อนหลัง').fill('ป่วย ไปโรงพยาบาล')
  await card.getByRole('button', { name: 'ส่งคำขอให้ครู' }).click()
  await expect(card.getByText('รอครูอนุมัติ', { exact: true })).toBeVisible()

  // ครู: เมนูสอบย้อนหลังมีตัวเลข → อนุมัติ + เพดาน 80% → ได้รหัสเริ่มสอบ
  await t.goto('/teacher')
  await teacherNav(t, /^สอบย้อนหลัง 1 รายการรอครู$/)
  const row = t.getByTestId('mk-3')
  await expect(row).toContainText('“ป่วย ไปโรงพยาบาล”')
  await row.getByLabel('เพดานคะแนน').selectOption('80')
  await expect(row.getByLabel('ชุดข้อสอบ')).toHaveValue(/.+/)
  await row.getByRole('button', { name: 'อนุมัติ', exact: true }).click()
  const flash = t.getByRole('status')
  await expect(flash).toContainText(/รหัสเริ่มสอบ \d{6}/)
  const code = (await flash.textContent())!.match(/\d{6}/)![0]
  await expect(t.getByTestId('code-3')).toContainText(code)

  // นักเรียน: เข้าห้องสอบ → รหัสผิดไม่ได้ → รหัสถูกเริ่มสอบ
  await s.reload()
  await s.getByRole('link', { name: /เข้าห้องสอบ/ }).click()
  // คุมสอบด้วยกล้อง (ครูเปิดไว้เป็นค่าเริ่มต้น): ต้องกดยินยอมก่อน
  const go = s.getByRole('button', { name: 'เปิดกล้องและเริ่มสอบ' })
  await s.getByLabel('รหัสเริ่มสอบ').fill(code === '000000' ? '111111' : '000000')
  await expect(go).toBeDisabled()
  await s.getByLabel('ยินยอมให้ถ่ายภาพระหว่างสอบ').check()
  await go.click()
  await expect(s.getByText('รหัสเริ่มสอบไม่ถูกต้อง — ขอรหัสจากครู')).toBeVisible()
  await s.getByLabel('รหัสเริ่มสอบ').fill(code)
  await go.click()
  await expect(s.getByTestId('exam-timer')).toBeVisible()
  // สแกนโต๊ะ 3 ภาพก่อน ข้อสอบถูกบังจนกว่าจะเสร็จ → แล้วเหลือภาพกล้องหน้าเล็ก ๆ มุมจอ
  const cam = s.getByTestId('proctor')
  await expect(cam).toHaveAttribute('data-mode', 'room')
  await cam.getByRole('button', { name: 'เริ่มสแกน (3 ภาพ)' }).click()
  await expect(cam).toHaveAttribute('data-mode', 'face', { timeout: 20_000 })
  await expect(cam.getByText('● REC')).toBeVisible()
  await s.waitForResponse((r) => r.url().includes('/photo?kind=face') && r.ok())
  await expect(s.getByTestId('watermark').first()).toContainText('มานี')

  // ตอบตามข้อความ (ลำดับข้อ/ตัวเลือกถูกสลับ)
  for (const [q, a] of [
    ['หนึ่งบวกหนึ่ง', 'สอง'],
    ['สองบวกสอง', 'สี่'],
  ]) {
    const box = s.getByTestId('exam-q').filter({ hasText: q })
    await box.getByRole('radio').filter({ hasText: a }).click()
  }
  await expect(s.getByText('บันทึกแล้ว ✓')).toBeVisible()

  // ออกจากหน้าจอ 1 ครั้ง (สลับแอป)
  const flip = (v: 'hidden' | 'visible') =>
    s.evaluate((state) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }, v)
  await flip('hidden')
  await s.waitForTimeout(400)
  await flip('visible')
  await expect(s.getByRole('alert')).toContainText('ออกจากหน้าสอบ 1/3 ครั้ง')

  await s.getByRole('button', { name: 'ตรวจคำตอบก่อนส่ง →' }).click()
  await expect(s.getByRole('heading', { name: 'ตรวจคำตอบก่อนส่ง' })).toBeVisible()
  await s.getByRole('button', { name: 'ยืนยันส่งคำตอบ' }).click()
  await expect(s.getByRole('heading', { name: 'ส่งคำตอบแล้ว รอครูตรวจ' })).toBeVisible()

  // ครู: รอตรวจ → ถูก 2/2 = 10 → เพดาน 80% = 8 · บันทึกการสอบเห็นการออกจากหน้าจอ · กระดาษ ZipGrade ฝนแล้ว
  await t.reload()
  await t.getByTestId('mk-3').getByRole('link', { name: /ตรวจ · ให้คะแนน/ }).click()
  await expect(t.getByTestId('auto-score')).toContainText('ถูก 2/2 ข้อ = 10 → เพดาน 80% = 8')
  await expect(t.getByTestId('exam-log')).toContainText('ออกจากหน้าสอบ')
  // ภาพคุมสอบ: สแกนโต๊ะ 3 ภาพ + กล้องหน้า
  const photos = t.getByTestId('proctor-photos')
  await expect(photos.getByRole('img', { name: /^สแกนโต๊ะ/ })).toHaveCount(3)
  await expect(photos.getByRole('img', { name: /^กล้องหน้า/ }).first()).toBeVisible()
  await expect(t.getByTestId('zipgrade-sheet')).toBeVisible()
  await expect(t.getByLabel('คะแนนสอบย้อนหลัง')).toHaveValue('8')
  await t.getByRole('button', { name: 'บันทึกคะแนน' }).click()
  await expect(t.getByText('บันทึกคะแนนแล้ว · ลงช่องสอบเดิมในสมุดคะแนน')).toBeVisible()

  const sheet = await (await t.request.get(`/api/teacher/score-items/${itemId}`)).json()
  const manee = sheet.students.find((r: { id: string }) => r.id === studentId)
  expect(manee.score).toBe(8)
  expect(manee.absent).toBe(false)

  await s.goto('/me/scores')
  await expect(s.getByTestId('makeup-card')).toContainText('ครูให้คะแนนแล้ว')
})
