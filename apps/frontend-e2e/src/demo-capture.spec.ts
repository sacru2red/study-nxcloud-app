import { test, expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { workspaceRoot } from '@nx/devkit'
import { ADMIN_USER, loginAs } from './support/auth'

const SCREENSHOTS_DIR = join(workspaceRoot, 'docs', 'screenshots')
const DEMO_PDF_NAME = '202212301672357894280.pdf'
const DEMO_PDF_PATH = join(workspaceRoot, '.tmp', 'demo-pdfs', DEMO_PDF_NAME)
const RAG_QUESTION = '하이브리드 자동차가 무엇인가요?'
const NO_SOURCE_QUESTION = '오늘 서울 날씨는 어떤가요?'
const BACKEND_API_BASE_URL = process.env['BACKEND_API_BASE_URL'] || 'http://localhost:3000/api'

test.describe.configure({ mode: 'serial', timeout: 900_000 })
let uploadedDocumentId: string | null = null

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SCREENSHOTS_DIR, name), fullPage: false })
}

/** 답변·출처 카드로 스크롤이 밀린 뒤에도 데모 스샷에 질문이 보이도록 한다. */
async function scrollChatQuestionIntoView(page: Page, question: string): Promise<void> {
  const userBubble = page.getByTestId('chat-user-message').filter({ hasText: question }).last()
  await expect(userBubble).toBeVisible({ timeout: 10_000 })
  await userBubble.evaluate((element) => {
    element.scrollIntoView({ block: 'start', inline: 'nearest' })
  })
  await page.waitForTimeout(400)
}

async function getAccessTokenFromLocalStorage(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem('accessToken'))
  if (!raw) {
    throw new Error('accessToken not found in localStorage')
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'string') {
      return parsed
    }
    return raw
  } catch {
    return raw
  }
}

async function getUserInfoFromLocalStorage(page: Page): Promise<{ tenantId: string }> {
  const raw = await page.evaluate(() => localStorage.getItem('user'))
  if (!raw) {
    throw new Error('user not found in localStorage')
  }
  const parsed = JSON.parse(raw) as { tenantId?: string }
  if (!parsed.tenantId) {
    throw new Error('tenantId not found in localStorage user data')
  }
  return { tenantId: parsed.tenantId }
}

async function waitForUploadedDocumentByListApi(
  page: Page,
  accessToken: string,
  tenantId: string,
  fileName: string,
): Promise<string> {
  const maxAttempts = 60
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const filesResponse = await page.request.get(
      `${BACKEND_API_BASE_URL}/tenants/${tenantId}/files`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
    if (!filesResponse.ok()) {
      throw new Error(`Failed to list files for upload fallback: ${filesResponse.status()}`)
    }
    const files = (await filesResponse.json()) as Array<{
      documentId: string
      fileName: string
      createdAt?: string
    }>
    const matchedFiles = files.filter((file) => file.fileName === fileName)
    if (matchedFiles.length > 0) {
      matchedFiles.sort((left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
      )
      return matchedFiles[0].documentId
    }
    await page.waitForTimeout(2_000)
  }
  throw new Error(`Uploaded file "${fileName}" not found in files list`)
}

async function uploadPdf(page: Page, filePath: string, fileName: string): Promise<string> {
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/tenants/') &&
      response.url().includes('/files') &&
      response.status() === 201,
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: '+ Upload PDF' }).click()
  await page.waitForTimeout(100)
  await page.locator('input[type="file"]').setInputFiles(filePath)
  const uploadResponse = await uploadResponsePromise
  const uploadResult = (await uploadResponse.json()) as { documentId?: string }
  const accessToken = await getAccessTokenFromLocalStorage(page)
  const userInfo = await getUserInfoFromLocalStorage(page)
  const documentId =
    uploadResult.documentId ??
    (await waitForUploadedDocumentByListApi(page, accessToken, userInfo.tenantId, fileName))

  if (!documentId) {
    throw new Error('Upload response does not include documentId')
  }

  // 업로드 직후 목록 캐시가 갱신되지 않은 경우가 있어 강제 새로고침으로 UI를 동기화한다.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 30_000 })

  return documentId
}

async function waitForIndexCompleted(
  page: Page,
  fileName: string,
  documentId: string,
): Promise<void> {
  const accessToken = await getAccessTokenFromLocalStorage(page)
  const maxAttempts = 150
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await page.request.get(
      `${BACKEND_API_BASE_URL}/files/${documentId}/index-status`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
    if (response.ok()) {
      const indexStatus = (await response.json()) as { status?: string }
      if (indexStatus.status === 'COMPLETED') {
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
          timeout: 30_000,
        })
        const completedItem = page
          .locator(`li[data-document-id="${documentId}"]`)
          .filter({ hasText: 'COMPLETED' })
        await expect(completedItem).toBeVisible({ timeout: 30_000 })
        return
      }
      if (indexStatus.status === 'FAILED') {
        throw new Error(`Indexing failed for document ${documentId}`)
      }
    }

    if ((attempt + 1) % 3 === 0) {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
        timeout: 30_000,
      })
    }
    await page.waitForTimeout(5_000)
  }

  throw new Error(
    `Indexing did not complete within ${(maxAttempts * 5) / 60} minutes for document ${documentId} (${fileName})`,
  )
}

async function submitChatQuestion(page: Page, question: string) {
  const chatInput = page.getByPlaceholder('Ask a question about this document...')
  await expect(chatInput).toBeEnabled({ timeout: 30_000 })

  const chatResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/chat') && response.ok(),
    { timeout: 90_000 },
  )

  await chatInput.fill(question)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thinking...')).not.toBeVisible({ timeout: 60_000 })

  const chatResponse = await chatResponsePromise
  await expect(page.getByTestId('chat-assistant-message').last()).toBeVisible({
    timeout: 10_000,
  })

  return chatResponse
}

async function askChat(page: Page, question: string): Promise<void> {
  await submitChatQuestion(page, question)
}

interface ChatApiResponse {
  answer?: string
  sources?: Array<{ pageNo: number; paragraphNo: number }>
  diagnostics?: {
    reason?: string
    llmError?: { message?: string; retryAfterSeconds?: number | null }
  }
}

async function askChatExpectingSources(
  page: Page,
  question: string,
  documentId: string,
  fileName: string,
  maxAttempts = 4,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
        timeout: 30_000,
      })
      await selectDemoFileAndWaitForPdf(page, fileName, documentId)
    }

    const chatResponse = await submitChatQuestion(page, question)
    const chatBody = (await chatResponse.json()) as ChatApiResponse

    if (chatBody.sources && chatBody.sources.length > 0) {
      await expect(page.getByText(/Page \d+, Paragraph \d+/).first()).toBeVisible({
        timeout: 10_000,
      })
      return
    }

    const reason = chatBody.diagnostics?.reason ?? 'unknown'
    const isRetryable = reason === 'LLM_API_FAILED' || reason === 'EMBEDDING_FAILED'
    if (isRetryable && attempt < maxAttempts - 1) {
      const retryAfterSeconds = chatBody.diagnostics?.llmError?.retryAfterSeconds ?? 5
      await page.waitForTimeout(Math.min(retryAfterSeconds * 1000, 30_000))
      continue
    }

    throw new Error(
      `Chat did not return sources for document ${documentId} (reason=${reason}, answer=${chatBody.answer ?? 'n/a'}, llmError=${chatBody.diagnostics?.llmError?.message ?? 'n/a'})`,
    )
  }
}

async function goToMainPageAsAdmin(page: Page): Promise<void> {
  await loginAs(page, ADMIN_USER)
}

async function waitForPdfReady(page: Page): Promise<void> {
  const viewer = page.getByTestId('pdf-viewer')
  await expect(viewer).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('pdf-loading')).toHaveCount(0, { timeout: 60_000 })
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="pdf-viewer"]')
      if (!(root instanceof HTMLElement)) {
        return false
      }
      if (root.getAttribute('data-pdf-page-ready') !== 'true') {
        return false
      }
      const canvas = root.querySelector('.react-pdf__Page__canvas')
      if (!(canvas instanceof HTMLCanvasElement)) {
        return false
      }
      const style = window.getComputedStyle(canvas)
      return canvas.width > 0 && style.visibility !== 'hidden'
    },
    { timeout: 60_000 },
  )
  await expect(viewer.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 10_000 })
  await expect(viewer.getByText(/Page \d+ \/ \d+/)).toBeVisible({ timeout: 10_000 })
}

async function waitForPdfContentResponse(page: Page): Promise<void> {
  await page
    .waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/content') &&
        response.ok(),
      { timeout: 60_000 },
    )
    .catch(() => undefined)
}

async function selectDemoFileAndWaitForPdf(
  page: Page,
  fileName: string,
  documentId?: string | null,
): Promise<void> {
  const contentReady = waitForPdfContentResponse(page)
  await selectDemoFile(page, fileName, documentId)
  await contentReady
  await waitForPdfReady(page)
}

async function screenshotWithPdf(page: Page, name: string): Promise<void> {
  await waitForPdfReady(page)
  await page.waitForTimeout(400)
  await screenshot(page, name)
}

async function selectDemoFile(
  page: Page,
  fileName: string,
  documentId?: string | null,
): Promise<void> {
  if (documentId) {
    const documentItem = page.locator(`li[data-document-id="${documentId}"]`)
    await expect(documentItem).toBeVisible({ timeout: 30_000 })
    await documentItem.click()
    return
  }

  const fileItems = page.locator('li').filter({ hasText: fileName })
  const completedItems = fileItems.filter({ hasText: 'COMPLETED' })
  if ((await completedItems.count()) > 0) {
    await completedItems.first().click()
    return
  }
  await fileItems.first().click()
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })
})

test('Screenshot 01 - Login', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(ADMIN_USER.email)
  await page.locator('input[type="password"]').fill(ADMIN_USER.password)
  await screenshot(page, '01-login.png')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible({
    timeout: 30_000,
  })
})

test('Screenshot 02 - Upload PDF', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  uploadedDocumentId = await uploadPdf(page, DEMO_PDF_PATH, DEMO_PDF_NAME)
  await screenshot(page, '02-upload-pdf.png')
})

test('Screenshot 03 - Index Completed', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  if (!uploadedDocumentId) {
    throw new Error('uploadedDocumentId is not set from upload step')
  }
  await waitForIndexCompleted(page, DEMO_PDF_NAME, uploadedDocumentId)
  await screenshot(page, '03-index-completed.png')
})

test('Screenshot 04 - Main Layout with PDF', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  if (!uploadedDocumentId) {
    throw new Error('uploadedDocumentId is not set from upload step')
  }
  const pdfContentPromise = waitForPdfContentResponse(page)
  await selectDemoFile(page, DEMO_PDF_NAME, uploadedDocumentId)
  await pdfContentPromise
  await screenshotWithPdf(page, '04-main-layout.png')
})

test('Screenshot 05 - 1 - Chat Question', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  if (!uploadedDocumentId) {
    throw new Error('uploadedDocumentId is not set from upload step')
  }
  await selectDemoFileAndWaitForPdf(page, DEMO_PDF_NAME, uploadedDocumentId)
  await askChatExpectingSources(page, RAG_QUESTION, uploadedDocumentId, DEMO_PDF_NAME)
  await scrollChatQuestionIntoView(page, RAG_QUESTION)
  await screenshotWithPdf(page, '05-1-chat-with-sources.png')

  await page.getByTestId('chat-source-card').first().click()
  await waitForPdfReady(page)
  await page.locator('span:has-text("Page")').last().waitFor({ state: 'visible', timeout: 10_000 })
  await scrollChatQuestionIntoView(page, RAG_QUESTION)
  await page.waitForTimeout(600)
  await screenshotWithPdf(page, '05-1-1-source-page-nav.png')
})

test('Screenshot 05 - 2 - Chat Question', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  if (!uploadedDocumentId) {
    throw new Error('uploadedDocumentId is not set from upload step')
  }
  await selectDemoFileAndWaitForPdf(page, DEMO_PDF_NAME, uploadedDocumentId)
  const overviewQuestion = '개요페이지는 몇 페이지야'
  await askChat(page, overviewQuestion)
  await scrollChatQuestionIntoView(page, overviewQuestion)
  await screenshotWithPdf(page, '05-2-chat-with-sources.png')
})

test('Screenshot 06 - Chat No Source', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  if (!uploadedDocumentId) {
    throw new Error('uploadedDocumentId is not set from upload step')
  }
  await selectDemoFileAndWaitForPdf(page, DEMO_PDF_NAME, uploadedDocumentId)
  await askChat(page, NO_SOURCE_QUESTION)
  await expect(page.getByText(/문서에서 확인 불가/).first()).toBeVisible({ timeout: 60_000 })
  await screenshotWithPdf(page, '06-chat-no-source.png')
})

test('Screenshot 07 - Admin Usage', async ({ page }) => {
  await goToMainPageAsAdmin(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
  await screenshot(page, '07-admin-usage.png')
})
