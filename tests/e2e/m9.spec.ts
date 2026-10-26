import { expect, test } from '@playwright/test'

// ห้อง "โรงเรียนทดสอบ ชั้น 1" (จาก m0)
test('สุ่มชื่อไม่ซ้ำจนครบทุกคน แล้วเริ่มรอบใหม่', async ({ page }) => {
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await page.getByRole('link', { name: 'ผังห้อง & แต้ม' }).click()
  const counter = page.getByText(/สุ่มชื่อ \(เหลือ \d+ คน/)
  await expect(counter).not.toContainText('เหลือ 0 คน')
  const total = Number((await counter.textContent())!.match(/เหลือ (\d+)/)![1])
  expect(total).toBeGreaterThan(1)
  const box = counter.locator('..')
  const seen = new Set<string>()
  for (let i = 1; i <= total; i++) {
    await page.getByRole('button', { name: 'สุ่มชื่อ', exact: true }).click()
    await expect(counter).toContainText(`เหลือ ${total - i} คน`)
    seen.add((await box.locator('span.text-2xl').textContent())!)
  }
  expect(seen.size).toBe(total)
  await page.getByRole('button', { name: 'สุ่มชื่อ', exact: true }).click()
  await expect(counter).toContainText(`เหลือ ${total - 1} คน`)
})
