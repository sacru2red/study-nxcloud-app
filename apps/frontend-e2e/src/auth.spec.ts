import { test, expect } from '@playwright/test'
import { ADMIN_USER, loginAs } from './support/auth'

test.describe('인증', () => {
  test('로그인 페이지가 표시된다', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  test('미인증 사용자는 메인에서 로그인으로 이동한다', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  })

  test('시드 계정으로 로그인하면 메인 화면이 표시된다', async ({ page }) => {
    await loginAs(page, ADMIN_USER)

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Upload PDF' })).toBeVisible()
    await expect(page.getByText(ADMIN_USER.email)).toBeVisible()
  })

  test('잘못된 비밀번호면 로그인에 실패한다', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(ADMIN_USER.email)
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  })
})
