import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { workspaceRoot } from '@nx/devkit'
import { ADMIN_USER, loginAs } from './support/auth'

const BACKEND_API_BASE_URL = process.env['BACKEND_API_BASE_URL'] || 'http://localhost:3000/api'
const RETRY_PDF_PATH = join(workspaceRoot, '.tmp', 'demo-pdfs', '202212301672357894280.pdf')

test('업로드 직후 재시도 API를 호출하면 UI에 결과 메시지를 표시한다', async ({ page }) => {
  await loginAs(page, ADMIN_USER)

  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/tenants/') &&
      response.url().includes('/files') &&
      response.status() === 201,
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: '+ Upload PDF' }).click()
  await page.locator('input[type="file"]').setInputFiles(RETRY_PDF_PATH)
  const uploadResponse = await uploadResponsePromise
  const uploadResult = (await uploadResponse.json()) as { documentId?: string }
  const documentId = uploadResult.documentId
  if (!documentId) {
    throw new Error('Upload response does not include documentId')
  }

  const accessTokenRaw = await page.evaluate(() => localStorage.getItem('accessToken'))
  const accessToken =
    accessTokenRaw && accessTokenRaw.startsWith('"')
      ? (JSON.parse(accessTokenRaw) as string)
      : accessTokenRaw
  if (!accessToken) {
    throw new Error('accessToken not found')
  }

  const retryResponse = await page.request.post(
    `${BACKEND_API_BASE_URL}/files/${documentId}/retry`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
  expect(retryResponse.ok()).toBe(true)

  const documentItem = page.locator(`li[data-document-id="${documentId}"]`)
  await expect(documentItem).toBeVisible({ timeout: 30_000 })

  const retryButton = documentItem.getByRole('button', { name: /재시도|임베딩 진행 중/ })
  if (await retryButton.isVisible()) {
    await retryButton.click()
    await expect(page.getByText(/재시도|이미|완료|진행/i).first()).toBeVisible({ timeout: 15_000 })
  }
})

test('업로드 문서는 WebSocket 진행 반영 후 COMPLETED로 표시된다', async ({ page }) => {
  await loginAs(page, ADMIN_USER)

  const pdfBuffer = readFileSync(RETRY_PDF_PATH)
  const accessTokenRaw = await page.evaluate(() => localStorage.getItem('accessToken'))
  const userRaw = await page.evaluate(() => localStorage.getItem('user'))
  const accessToken =
    accessTokenRaw && accessTokenRaw.startsWith('"')
      ? (JSON.parse(accessTokenRaw) as string)
      : accessTokenRaw
  const user = userRaw ? (JSON.parse(userRaw) as { tenantId: string }) : null
  if (!accessToken || !user?.tenantId) {
    throw new Error('auth context missing')
  }

  const uploadResponse = await page.request.post(
    `${BACKEND_API_BASE_URL}/tenants/${user.tenantId}/files`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      multipart: {
        file: {
          name: 'e2e-ws-status.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer,
        },
      },
    },
  )
  expect(uploadResponse.status()).toBe(201)
  const uploadResult = (await uploadResponse.json()) as { documentId: string }
  const documentId = uploadResult.documentId

  await expect
    .poll(
      async () => {
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
          timeout: 15_000,
        })
        const item = page.locator(`li[data-document-id="${documentId}"]`)
        return (await item.filter({ hasText: 'COMPLETED' }).count()) > 0
      },
      { timeout: 120_000 },
    )
    .toBe(true)
})
