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
  await t.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
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
  await t.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
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
