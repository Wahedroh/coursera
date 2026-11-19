import type { Page } from '@playwright/test'

/** เมนูครู: จอใหญ่อยู่ที่เมนูข้าง · มือถือ (Pixel 7) อยู่ในแผ่นเมนูจากแถบล่าง */
export async function teacherNav(page: Page, name: string | RegExp) {
  const opts = { name, exact: typeof name === 'string' }
  const side = page.getByRole('navigation', { name: 'เมนูหลัก' })
  if (await side.isVisible()) return side.getByRole('link', opts).click()
  await page.getByRole('button', { name: /^เมนูทั้งหมด/ }).click()
  await page.getByRole('dialog', { name: 'เมนูทั้งหมด' }).getByRole('link', opts).click()
}
