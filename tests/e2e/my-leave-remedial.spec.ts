import { expect, test, type Browser, type Page } from '@playwright/test'

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

/** เปิดเช็กชื่อวันนี้ของห้องทดสอบ แล้วตั้งสถานะของมานี */
async function setManee(t: Page, status: string) {
  const schools = await (await t.request.get('/api/teacher/classes')).json()
  const cls = schools.flatMap((s: { classes: { id: string; name: string }[] }) => s.classes).find((c: { name: string }) => c.name === 'โรงเรียนทดสอบ ชั้น 1')
  const day = await (await t.request.post(`/api/teacher/classes/${cls.id}/attendance`, { data: { date: today() } })).json()
  const manee = day.records.find((r: { zipgradeId: string }) => r.zipgradeId === '3')
  expect((await t.request.put(`/api/teacher/attendance/${day.day.id}/records/${manee.studentId}`, { data: { status } })).ok()).toBe(true)
  return cls.id as string
}

test('ใบลาออนไลน์: นักเรียนขอลาป่วย → ครูเห็นในเมนูใบลา → อนุมัติ → นักเรียนเห็นผล', async ({ browser }) => {
  const s = await studentPage(browser)
  await s.getByRole('link', { name: 'ขอลาป่วย / ลากิจ' }).click()
  await s.getByRole('radio', { name: 'ลาป่วย' }).click()
  await s.getByLabel('เหตุผล').fill('มีไข้ หมอให้พัก')
  await s.getByRole('button', { name: 'ส่งใบลา' }).click()
  await expect(s.getByText('ส่งใบลาแล้ว รอครูอนุมัติ')).toBeVisible()
  await expect(s.getByText('รอครูอนุมัติ', { exact: true })).toBeVisible()

  const t = await teacherHome(browser)
  await expect(t.getByRole('link', { name: /^ใบลา 1 รายการรออนุมัติ$/ })).toBeVisible()
  await t.getByRole('link', { name: /ใบลา/ }).first().click()
  const card = t.getByTestId('leave-3')
  await expect(card).toContainText('“มีไข้ หมอให้พัก”')
  await card.getByLabel(/หมายเหตุถึง/).fill('หายไว ๆ')
  await card.getByRole('button', { name: 'อนุมัติ', exact: true }).click()
  await expect(t.getByText(/อนุมัติใบลา .* แล้ว/)).toBeVisible()
  await expect(t.getByText('ไม่มีใบลารออนุมัติ')).toBeVisible()

  await s.reload()
  await expect(s.getByText('อนุมัติแล้ว', { exact: true })).toBeVisible()
  await expect(s.getByText('ครู: หายไว ๆ')).toBeVisible()
})

test('เฝ้าระวัง 0·ร·มส: ครูเห็นนักเรียนติด มส → สั่งงานซ่อม → นักเรียนส่งในแอป → ครูให้ผ่าน (ผลหลังซ่อม)', async ({ browser }) => {
  test.setTimeout(120_000)
  const t = await teacherHome(browser)
  const classId = await setManee(t, 'absent')
  await t.goto(`/teacher/classes/${classId}`)
  await t.getByRole('link', { name: '0 · ร · มส' }).click()
  await expect(t.getByRole('heading', { name: 'เฝ้าระวัง 0 · ร · มส' })).toBeVisible()
  const row = t.getByTestId('risk-3')
  await expect(row.getByText('มส', { exact: true })).toBeVisible()
  await row.getByRole('checkbox').click()
  await t.getByLabel('ชื่องานซ่อม').fill('งานซ่อมเวลาเรียน')
  await t.getByLabel('รายละเอียดงานซ่อม').fill('สรุปบทเรียนที่ขาด 1 หน้า')
  await t.getByRole('button', { name: 'สั่งงานซ่อม' }).click()
  await expect(t.getByText('สั่งงานซ่อมให้ 1 คนแล้ว · นักเรียนได้รับแจ้งเตือน')).toBeVisible()
  await expect(row).toContainText('งานซ่อม (มส): งานซ่อมเวลาเรียน')

  const s = await studentPage(browser)
  const cards = s.getByTestId('home-cards')
  await expect(cards.getByRole('region', { name: 'เวลาเรียน' })).toBeVisible()
  await cards.getByRole('link', { name: /งานซ่อมเวลาเรียน/ }).click()
  await expect(s.getByText('สรุปบทเรียนที่ขาด 1 หน้า')).toBeVisible()
  await s.getByLabel('คำตอบงานซ่อม').fill('สรุปเรื่องเวกเตอร์')
  await s.getByRole('button', { name: 'ส่งงานซ่อม' }).click()
  await expect(s.getByText('ส่งแล้ว รอตรวจ')).toBeVisible()

  await t.reload()
  await expect(row).toContainText('สรุปเรื่องเวกเตอร์')
  await row.getByLabel(/ผลหลังซ่อม/).selectOption('1')
  await row.getByRole('button', { name: 'ผ่าน', exact: true }).click()
  await expect(t.getByText(/ผ่านแล้ว · ผลหลังซ่อม 1/)).toBeVisible()
  await expect(row.getByText('ผลหลังซ่อม 1')).toBeVisible()

  // คืนสถานะเดิม และลบงานซ่อม (ไม่กระทบเทสต์อื่น)
  t.once('dialog', (d) => void d.accept())
  await row.getByRole('button', { name: 'ลบ', exact: true }).click()
  await setManee(t, 'present')
})

test('กล่องของขวัญจากไข่ที่เปิดไปแล้ว → ได้ของแถม → ใส่ที่ตัวละครได้ (ของที่ยังไม่มีล็อกไว้)', async ({ browser }) => {
  const s = await studentPage(browser)
  await s.goto('/me/progress')
  await expect(s.getByTestId('item-collection')).toBeVisible()
  // เปิดกล่องของขวัญทั้งหมด (ไข่ที่เปิดก่อนมีของแถม)
  while (await s.getByRole('button', { name: 'เปิดกล่อง' }).count()) {
    await s.getByRole('button', { name: 'เปิดกล่อง' }).click()
    await expect(s.getByTestId('egg-result')).toBeVisible()
  }
  const { items } = await (await s.request.get('/api/student/progress')).json()
  await s.goto('/me/avatar')
  await expect(s.getByRole('group', { name: /ชุดพิเศษ/ })).toBeVisible()
  await expect(s.getByLabel('ชุดนินจา (ยังไม่มี)').or(s.getByRole('button', { name: 'ชุดนินจา' }))).toBeVisible()
  const hand = (items as string[]).find((x) => x.startsWith('hand:'))
  if (hand) {
    const names: Record<string, string> = { pencil: 'ดินสอยักษ์', umbrella: 'ร่มวิเศษ', balloon: 'ลูกโป่ง', flag: 'ธงประจำห้อง', staff: 'ไม้พลอง', wand: 'ไม้กายสิทธิ์', sword: 'ดาบอัศวิน', bow: 'ธนู', laser: 'ปืนเลเซอร์' }
    await s.getByRole('button', { name: names[hand.slice(5)], exact: true }).click()
    await s.getByRole('button', { name: 'บันทึกตัวละคร' }).click()
    await expect(s.getByRole('button', { name: '✓ บันทึกแล้ว' })).toBeVisible()
    // เอาออก (ไม่กระทบเทสต์อื่น)
    await s.getByRole('group', { name: /มือขวา/ }).getByRole('button', { name: 'ไม่ถือ' }).click()
    await s.getByRole('button', { name: 'บันทึกตัวละคร' }).click()
    await expect(s.getByRole('button', { name: '✓ บันทึกแล้ว' })).toBeVisible()
  }
})
