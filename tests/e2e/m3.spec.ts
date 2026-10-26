import { expect, test, type Browser, type Page } from '@playwright/test'

async function teacherPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return page
}

async function studentPage(browser: Browser, id: string, pin: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill(id)
  await page.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByText(/สวัสดี/)).toBeVisible()
  return page
}

// ต่อจาก m2: ห้อง "โรงเรียนทดสอบ ชั้น 1" มี สมใจ, สมชาย, มานี (รหัส 3, PIN 1357)
test('ครูสร้างรายการคะแนน → วางคะแนนจาก Excel → เผยแพร่ → นักเรียนเห็นคะแนนตัวเอง', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'คะแนนสอบ' }).click()
  await teacher.getByLabel('ชื่อรายการ').fill('สอบย่อย บทที่ 3')
  await teacher.getByLabel('คะแนนเต็ม').fill('20')
  await teacher.getByRole('button', { name: 'สร้างรายการ' }).click()
  await expect(teacher.getByRole('heading', { name: 'สอบย่อย บทที่ 3' })).toBeVisible()

  // วางทั้งคอลัมน์ (บรรทัดว่าง = ยังไม่กรอก) ที่ช่องคนแรก
  const first = teacher.getByLabel(/^คะแนน /).first()
  await first.click()
  await first.evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', '18\r\n\r\n17.5\r\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(teacher.getByLabel('คะแนน มานี มีนา')).toHaveValue('17.5')
  await expect(teacher.getByTestId('score-stats')).toContainText('2/3')
  await expect(teacher.getByTestId('score-stats')).toContainText('17.75')

  // ค่าเกินคะแนนเต็ม → กรอบแดง ไม่บันทึก
  const second = teacher.getByLabel(/^คะแนน /).nth(1)
  await second.fill('25')
  await second.press('Enter')
  await expect(second).toHaveAttribute('aria-invalid', 'true')
  await expect(teacher.getByTestId('score-stats')).toContainText('2/3')
  await teacher.getByLabel(/^ขาดสอบ /).nth(1).check()
  await expect(teacher.getByTestId('score-stats')).toContainText('3/3')

  // Enter ข้ามคนขาดสอบไปคนถัดไป
  await first.click()
  await first.press('Enter')
  await expect(teacher.getByLabel('คะแนน มานี มีนา')).toBeFocused()

  // วางซ้ำ: ค่าของคนขาดสอบถูกข้าม แถวไม่เลื่อน (ค่าที่ 3 ลงคนที่ 3)
  await first.evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', '19\n5\n17.5\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(first).toHaveValue('19')
  await expect(teacher.getByLabel('คะแนน มานี มีนา')).toHaveValue('17.5')
  await expect(teacher.getByText(/ข้ามคนที่ติ๊กขาดสอบ 1 คน/)).toBeVisible()
  await expect(teacher.getByTestId('score-stats')).toContainText('18.25')

  const student = await studentPage(browser, '3', '1357')
  await student.getByRole('link', { name: /คะแนนสอบ/ }).click()
  await expect(student.getByText('ยังไม่มีคะแนนที่ครูเผยแพร่')).toBeVisible()

  await teacher.getByRole('button', { name: 'เผยแพร่' }).click()
  await expect(teacher.getByText('นักเรียนเห็นแล้ว')).toBeVisible()

  await student.reload()
  await expect(student.getByText('สอบย่อย บทที่ 3')).toBeVisible()
  await expect(student.getByTestId('my-score')).toHaveText('17.5/20')
  await expect(student.getByText('19')).toHaveCount(0)
})
