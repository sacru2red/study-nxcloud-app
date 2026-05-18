import { test, expect } from '@playwright/test'
import { ADMIN_USER, REGULAR_USER, loginAs } from './support/auth'

test.describe('관리자', () => {
  test('admin 역할은 관리자 대시보드에 접근할 수 있다', async ({ page }) => {
    await loginAs(page, ADMIN_USER)

    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
    await expect(page.getByText(ADMIN_USER.email, { exact: true })).toBeVisible()
  })

  test('일반 사용자는 관리자 페이지에서 메인으로 돌아간다', async ({ page }) => {
    await loginAs(page, REGULAR_USER)

    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).not.toBeVisible()
  })
})
