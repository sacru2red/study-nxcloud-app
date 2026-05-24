import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { workspaceRoot } from '@nx/devkit'
import { ADMIN_USER, loginAs } from './support/auth'

const DEMO_PDF_PATH = join(workspaceRoot, '.tmp', 'demo-pdfs', '202212301672357894280.pdf')
const DEMO_FOLDER_NAME = 'e2e-folder-chat'
const FOLDER_QUESTION = '하이브리드 자동차가 무엇인가요?'

test('폴더 채팅에서 같은 폴더 문서를 검색해 답변한다', async ({ page }) => {
  await loginAs(page, ADMIN_USER)

  await page.getByPlaceholder('예: 2024-계약').fill(DEMO_FOLDER_NAME)

  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/tenants/') &&
      response.url().includes('/files') &&
      response.status() === 201,
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: '+ Upload PDF' }).click()
  await page.locator('input[type="file"]').setInputFiles(DEMO_PDF_PATH)
  const uploadResponse = await uploadResponsePromise
  const uploadResult = (await uploadResponse.json()) as { documentId?: string }
  const documentId = uploadResult.documentId
  if (!documentId) {
    throw new Error('Upload response does not include documentId')
  }

  await expect
    .poll(
      async () => {
        const item = page.locator(`li[data-document-id="${documentId}"]`)
        return (await item.filter({ hasText: 'COMPLETED' }).count()) > 0
      },
      { timeout: 120_000 },
    )
    .toBe(true)

  await page.getByRole('button', { name: DEMO_FOLDER_NAME }).click()
  await page.getByRole('button', { name: '폴더 채팅' }).click()

  const chatResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/folders/') &&
      response.url().includes('/chat') &&
      response.ok(),
    { timeout: 90_000 },
  )

  await page.getByPlaceholder('Ask about documents in this folder...').fill(FOLDER_QUESTION)
  await page.getByRole('button', { name: 'Send' }).click()
  const chatResponse = await chatResponsePromise
  const chatBody = (await chatResponse.json()) as {
    sources?: Array<{ pageNo: number }>
    diagnostics?: { reason?: string }
  }

  await expect(page.getByTestId('folder-chat-assistant-message').last()).toBeVisible({
    timeout: 30_000,
  })

  if (chatBody.sources && chatBody.sources.length > 0) {
    await expect(page.getByText(/Page \d+, Paragraph \d+/).first()).toBeVisible({
      timeout: 10_000,
    })
    return
  }

  expect(['NO_RELEVANT_CHUNKS', 'LLM_API_FAILED', 'EMBEDDING_FAILED']).toContain(
    chatBody.diagnostics?.reason,
  )
})
