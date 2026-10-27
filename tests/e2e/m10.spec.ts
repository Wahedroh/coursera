import { expect, test, type Browser } from '@playwright/test'

// ห้อง "โรงเรียนทดสอบ ชั้น 1": สมใจ (1), สมชาย (2), มานี (3, PIN 1357)
async function teacherPage(browser: Browser) {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await t.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await expect(t.getByText('รหัสห้อง')).toBeVisible()
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

test('นำเข้าคะแนนจาก ZipGrade แบบเทียบสัดส่วน แล้วแก้รายคนต่อได้', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.getByRole('link', { name: 'คะแนนสอบ' }).click()
  await t.getByLabel('ชื่อรายการ').fill('สอบ ZipGrade บทที่ 4')
  await t.getByLabel('คะแนนเต็ม').fill('20')
  await t.getByRole('button', { name: 'สร้างรายการ' }).click()
  await expect(t.getByRole('heading', { name: 'สอบ ZipGrade บทที่ 4' })).toBeVisible()
  await t.getByRole('button', { name: '📥 นำเข้าจาก ZipGrade' }).click()
  const csv = 'Quiz Name,Student First Name,Student Last Name,ZipGrade ID,Earned Points,Possible Points\nบท4,ก,ข,0001,8,10\nบท4,ค,ง,3,9.5,10\nบท4,จ,ฉ,999,5,10\n'
  await t.getByLabel('ไฟล์ผลสอบ (CSV)').setInputFiles({ name: 'quiz.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(t.getByTestId('import-summary')).toContainText('พบในห้องนี้2 คน')
  await expect(t.getByText(/ไม่อยู่ในห้องนี้ \(จะข้าม\): 999/)).toBeVisible()
  await expect(t.getByLabel(/เทียบสัดส่วนเป็นคะแนนเต็ม 20/)).toBeChecked()
  await t.getByLabel(/ติ๊ก "ขาดสอบ" ให้คนที่ไม่มีในไฟล์/).check()
  await t.getByRole('button', { name: /ยืนยันนำเข้า 2 คน/ }).click()
  await expect(t.getByText(/นำเข้าคะแนน 2 คน · ติ๊กขาดสอบ 1 คน/)).toBeVisible()
  await expect(t.getByLabel('คะแนน มานี มีนา')).toHaveValue('19')
  await expect(t.getByLabel('คะแนน สมใจ ใจดี')).toHaveValue('16')
  await expect(t.getByLabel('ขาดสอบ สมชาย รักเรียน')).toBeChecked()
  // แก้รายคนหลังนำเข้า
  await t.getByLabel('คะแนน มานี มีนา').fill('18.5')
  await t.getByLabel('คะแนน มานี มีนา').press('Enter')
  await t.reload()
  await expect(t.getByLabel('คะแนน มานี มีนา')).toHaveValue('18.5')
})

test('ครูประกาศ → นักเรียนเห็นที่หน้าแรกแล้วกดรับทราบ → ครูเห็นอ่านแล้ว 1/3', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.getByRole('link', { name: 'ประกาศ', exact: true }).click()
  await t.getByLabel('หัวข้อ').fill('พรุ่งนี้สอบบทที่ 2')
  await t.getByLabel(/รายละเอียด/).fill('นำเครื่องคิดเลขมาด้วย')
  await t.getByLabel(/ปักหมุด/).check()
  await t.getByRole('button', { name: 'ประกาศ', exact: true }).click()
  await expect(t.getByText(/ประกาศ "พรุ่งนี้สอบบทที่ 2" แล้ว 1 ห้อง/)).toBeVisible()
  await expect(t.getByText('อ่านแล้ว 0/3')).toBeVisible()

  const s = await studentPage(browser)
  await expect(s.getByText('พรุ่งนี้สอบบทที่ 2')).toBeVisible()
  await expect(s.getByText('นำเครื่องคิดเลขมาด้วย')).toBeVisible()
  await s.getByRole('button', { name: 'รับทราบ' }).click()
  await expect(s.getByRole('button', { name: 'รับทราบ' })).toHaveCount(0)
  await s.reload()
  await expect(s.getByText('พรุ่งนี้สอบบทที่ 2')).toBeVisible()
  await expect(s.getByRole('button', { name: 'รับทราบ' })).toHaveCount(0)

  await t.reload()
  await expect(t.getByText('อ่านแล้ว 1/3')).toBeVisible()
  await t.getByRole('button', { name: 'ใครยังไม่อ่าน' }).click()
  await expect(t.getByText(/ยังไม่อ่าน 2 คน: .*สมใจ ใจดี/)).toBeVisible()
})

test('หน้านักเรียนที่ต้องติดตาม และรายงานรายบุคคลพิมพ์ได้', async ({ browser }) => {
  const t = await teacherPage(browser)
  await t.getByRole('link', { name: 'ติดตามนักเรียน' }).click()
  await expect(t.getByRole('heading', { name: 'นักเรียนที่ต้องติดตาม' })).toBeVisible()
  await expect(t.getByRole('tab', { name: /ทั้งหมด \d+/ })).toBeVisible()
  await t.getByLabel('ค้างงานอย่างน้อย').fill('1')
  await expect(t.getByText('🎉 ไม่มีนักเรียนที่เข้าเงื่อนไข').or(t.getByRole('link', { name: /โรงเรียน.*ชั้น/ }).first())).toBeVisible()
  await t.getByRole('tab', { name: /ยังไม่ตั้ง PIN/ }).click()

  await t.getByRole('link', { name: 'หน้าแรก' }).click()
  await t.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await t.getByRole('link', { name: 'รายงานรายบุคคล' }).click()
  await expect(t.getByTestId('report-page')).toHaveCount(3)
  await expect(t.getByTestId('report-page').first()).toContainText('รายงานผลการเรียนรายบุคคล')
  await t.getByLabel('นักเรียน').selectOption({ label: 'มานี มีนา (3)' })
  await expect(t.getByTestId('report-page')).toHaveCount(1)
  await expect(t.getByTestId('report-page')).toContainText('สอบ ZipGrade บทที่ 4')
  await expect(t.getByTestId('report-page')).toContainText('18.5/20')
  const pdf = await t.pdf({ format: 'A4' })
  expect(pdf.byteLength).toBeGreaterThan(10_000)
})
