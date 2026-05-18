import { type Page, expect } from '@playwright/test'

export interface TestCredentials {
  email: string
  password: string
}

export const ADMIN_USER: TestCredentials = {
  email: 'user-a1@datco.kr',
  password: 'password123',
}

export const REGULAR_USER: TestCredentials = {
  email: 'user-a2@datco.kr',
  password: 'password123',
}

export async function loginAs(page: Page, credentials: TestCredentials): Promise<void> {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(credentials.email)
  await page.locator('input[type="password"]').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible()
}
