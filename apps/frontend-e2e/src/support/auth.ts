import { type Page, expect } from '@playwright/test'

export interface TestCredentials {
  email: string
  password: string
}

export const ADMIN_USER: TestCredentials = {
  email: 'user-a1@example.com',
  password: 'password123',
}

export const REGULAR_USER: TestCredentials = {
  email: 'user-a2@example.com',
  password: 'password123',
}

export async function loginAs(page: Page, credentials: TestCredentials): Promise<void> {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(credentials.email)
  await page.locator('input[type="password"]').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // 디버그: 로그인 후 502 등 에러 메시지가 보이면 콘솔에 출력
  const errorText = page.getByText(/request failed/i)
  const hasError = await errorText.isVisible({ timeout: 3_000 }).catch(() => false)
  if (hasError) {
    const bodyText = await page.locator('body').textContent()
    console.error(`[loginAs] Login may have failed. Page body snippet: ${bodyText?.slice(0, 300)}`)
  }

  await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
    timeout: 30_000,
  })
}
