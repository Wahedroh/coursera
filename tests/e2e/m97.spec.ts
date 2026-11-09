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
