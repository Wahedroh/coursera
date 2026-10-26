import { expect, test, type Browser, type Page } from '@playwright/test'

async function teacherPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return page
}

// ต่อจาก m3: มานี (รหัส 3, PIN 1357) อยู่ห้อง "โรงเรียนทดสอบ ชั้น 1"
test('ไลฟ์: ครูสร้างโพล+ควิซ → นักเรียนเข้าจากแบนเนอร์ ตอบแบบเรียลไทม์ → เปิดเฉลย → จบไลฟ์', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'ไลฟ์หน้าห้อง' }).click()
  await teacher.getByLabel('ชื่อไลฟ์').fill('ทบทวนบทที่ 3')
  await teacher.getByRole('button', { name: '+ สร้างไลฟ์' }).click()
  await expect(teacher.getByRole('heading', { name: 'ทบทวนบทที่ 3' })).toBeVisible()

  // โพล
  await teacher.getByLabel('คำถามโพล').fill('ชอบผลไม้อะไร')
  await teacher.getByLabel('ตัวเลือก 1', { exact: true }).fill('มะม่วง')
  await teacher.getByLabel('ตัวเลือก 2', { exact: true }).fill('ทุเรียน')
  await teacher.getByRole('button', { name: 'เพิ่มกิจกรรม' }).click()
  await expect(teacher.getByText('ชอบผลไม้อะไร')).toBeVisible()
  // ควิซ
  await teacher.getByRole('radio', { name: 'ควิซ' }).click()
  await teacher.getByLabel('คำถาม', { exact: true }).fill('5 × 3 = ?')
  await teacher.getByLabel('ตัวเลือก 1', { exact: true }).fill('8')
  await teacher.getByLabel('ตัวเลือก 2', { exact: true }).fill('15')
  await teacher.getByLabel('ตัวเลือก 2 ถูก').check()
  await teacher.getByLabel('เวลา (วินาที)').fill('60')
  await teacher.getByRole('button', { name: 'เพิ่มกิจกรรม' }).click()
  await expect(teacher.getByText('5 × 3 = ?')).toBeVisible()

  // จอโปรเจกเตอร์ (บัญชีครู)
  const screen = await teacher.context().newPage()
  await screen.goto(teacher.url().replace(/\/teacher\/live\/([^/]+)$/, '/live/$1/screen'))
  await expect(screen.getByText('รอครูเริ่มไลฟ์…')).toBeVisible()

  await teacher.getByRole('button', { name: '▶ เริ่มไลฟ์' }).click()
  await expect(screen.getByTestId('screen-prompt')).toHaveText('ชอบผลไม้อะไร')

  // นักเรียนเห็นแบนเนอร์
  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await student.getByRole('button', { name: d, exact: true }).click()
  await student.getByRole('link', { name: /มีไลฟ์: ทบทวนบทที่ 3/ }).click()
  await expect(student.getByTestId('live-prompt')).toHaveText('ชอบผลไม้อะไร')
  await student.getByRole('button', { name: /ทุเรียน/ }).click()
  await expect(student.getByTestId('live-answered')).toContainText('ส่งคำตอบแล้ว +1 EXP')
  // จำนวนคนตอบเด้งบนจอโดยไม่รีเฟรช
  await expect(screen.getByTestId('screen-count')).toContainText('1')
  await expect(teacher.getByTestId('response-count')).toContainText('ตอบแล้ว 1/')

  // ถัดไป → ควิซ เด้งขึ้นที่มือถือเอง
  await teacher.getByRole('button', { name: 'ถัดไป ▶' }).click()
  await expect(student.getByTestId('live-prompt')).toHaveText('5 × 3 = ?')
  await expect(screen.getByTestId('screen-prompt')).toHaveText('5 × 3 = ?')
  await student.getByRole('button', { name: /15/ }).click()
  await expect(student.getByTestId('live-answered')).toContainText('ส่งคำตอบแล้ว')

  await teacher.getByRole('button', { name: '📊 แสดงผลบนจอ' }).click()
  await expect(student.getByTestId('live-answered')).toContainText('ถูกต้อง! +3 EXP')
  await expect(screen.getByLabel('อันดับตอบถูกเร็วที่สุด')).toContainText('มานี')

  teacher.on('dialog', (d) => d.accept())
  await teacher.getByRole('button', { name: 'จบไลฟ์' }).click()
  await expect(student.getByText('🎉 จบไลฟ์แล้ว')).toBeVisible()
  await expect(screen.getByText('🎉 จบไลฟ์')).toBeVisible()
})
