import { test, expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { workspaceRoot } from '@nx/devkit'
import { ADMIN_USER, loginAs } from './support/auth'
import { listDemoPdfs, pickRagPdf, pickQuotaUploadPlan } from './support/demo-pdfs'
import type { DemoPdf } from './support/demo-pdfs'

const SCREENSHOTS_DIR = join(workspaceRoot, 'docs', 'screenshots')
const RAG_QUESTION = process.env.DEMO_CHAT_QUESTION || '이 문서의 주요 내용을 요약해 주세요.'
const NO_SOURCE_QUESTION = '오늘 서울 날씨는 어떤가요?'

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let ragPdf: DemoPdf

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })
})

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SCREENSHOTS_DIR, name), fullPage: false })
}

async function uploadPdf(page: Page, filePath: string, fileName: string): Promise<void> {
  await page.getByRole('button', { name: '+ Upload PDF' }).click()
  await page.waitForTimeout(100)
  await page.locator('input[type="file"]').setInputFiles(filePath)
  await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 30_000 })
}

async function waitForIndexCompleted(page: Page, fileName: string): Promise<void> {
  await expect(page.locator('li').filter({ hasText: fileName }).getByText('COMPLETED')).toBeVisible(
    { timeout: 120_000 },
  )
}

async function askChat(page: Page, question: string): Promise<void> {
  await expect(page.getByPlaceholder('Ask a question about this document...')).toBeEnabled({
    timeout: 30_000,
  })
  await page.getByPlaceholder('Ask a question about this document...').fill(question)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thinking...')).not.toBeVisible({ timeout: 60_000 })
  await page
    .locator('.rounded-2xl.rounded-bl-sm.bg-gray-100')
    .last()
    .toBeVisible({ timeout: 60_000 })
}

test('Screenshot 01 - Main Layout', async ({ page }) => {
  ragPdf = pickRagPdf()
  await loginAs(page, ADMIN_USER)
  await uploadPdf(page, ragPdf.path, ragPdf.name)
  await waitForIndexCompleted(page, ragPdf.name)
  await page.getByText(ragPdf.name, { exact: false }).click()
  await page.locator('iframe').waitFor({ state: 'attached', timeout: 30_000 })
  await screenshot(page, '01-main-layout.png')
})

test('Screenshot 02 - Index Completed', async ({ page }) => {
  await page.getByText(ragPdf.name, { exact: false }).click()
  await expect(
    page.locator('li').filter({ hasText: ragPdf.name }).getByText('COMPLETED'),
  ).toBeVisible()
  await screenshot(page, '02-index-completed.png')
})

test('Screenshot 03 - Chat with Sources', async ({ page }) => {
  await page.getByText(ragPdf.name, { exact: false }).click()
  await askChat(page, RAG_QUESTION)
  await expect(page.getByText(/Page \d+, Paragraph \d+/).first()).toBeVisible({ timeout: 60_000 })
  await screenshot(page, '03-chat-with-sources.png')
})

test('Screenshot 04 - Chat No Source', async ({ page }) => {
  await askChat(page, NO_SOURCE_QUESTION)
  await expect(page.getByText(/문서에서 확인 불가/).first()).toBeVisible({ timeout: 60_000 })
  await screenshot(page, '04-chat-no-source.png')
})

test('Screenshot 05 - Source Page Navigation', async ({ page }) => {
  await page.locator('.rounded-lg.border.border-gray-200.bg-gray-50').first().click()
  await page.locator('span:has-text("Page")').last().waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(1000)
  await screenshot(page, '05-source-page-nav.png')
})

test('Screenshot 06 - Admin Usage', async ({ page }) => {
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
  await screenshot(page, '06-admin-usage.png')
})

test('Screenshot 08 - Quota 50%', async ({ page }) => {
  const quotaPlan = pickQuotaUploadPlan()
  if (quotaPlan.length === 0) {
    test.skip()
    return
  }

  await page.evaluate(() => {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Document AI Chat' })).toBeVisible()

  for (const pdf of quotaPlan) {
    const uploadName = `${Date.now()}_${pdf.name}`
    await uploadPdf(page, pdf.path, uploadName)
  }

  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({
    timeout: 15_000,
  })
  await screenshot(page, '08-quota-50pct.png')
})
