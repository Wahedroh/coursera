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
