import axios from 'axios'
import FormData from 'form-data'
import api from 'backend-sdk'
import type { FilesDto } from '../../../backend/src/presentation/files.dto'

// ─── Minimal PDF Generator ────────────────────────────────────────────────
// Generates a valid minimal PDF with extractable text content for RAG testing.
function createTestPdf(): Buffer {
  // Minimal valid PDF 1.0 with one page of text content.
  // pdf-parse (pdf.js) requires properly structured xref/trailer.
  const textContent =
    'Document AI Chat System This system allows users to upload PDF documents and ask questions about their content. ' +
    'It uses RAG technology to find relevant information and generate accurate answers. ' +
    'The system supports multi-tenant environments with complete data isolation between tenants. ' +
    'Documents are stored in Nextcloud and processed using AI embeddings stored in pgvector.'

  // Build content stream (no parens in text to avoid PDF string escaping issues)
  const stream = `BT /F1 12 Tf 72 720 Td (${textContent}) Tj ET`

  // Build each object as raw bytes so offset tracking is exact
  const header = Buffer.from('%PDF-1.0\n', 'binary')

  const obj1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'binary')
  const obj2 = Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'binary')
  const obj3 = Buffer.from(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
    'binary',
  )
  const obj4 = Buffer.from(
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    'binary',
  )
  const obj5 = Buffer.from(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    'binary',
  )

  const offsets = [
    -1, // placeholder for entry 0 (free entry)
    header.length,
    header.length + obj1.length,
    header.length + obj1.length + obj2.length,
    header.length + obj1.length + obj2.length + obj3.length,
    header.length + obj1.length + obj2.length + obj3.length + obj4.length,
  ]

  const body = Buffer.concat([obj1, obj2, obj3, obj4, obj5])
  const xrefOffset = header.length + body.length

  const xref =
    `xref\n0 6\n` +
    `0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, '0') + ' 00000 n ')
      .join('\n') +
    '\n'

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.concat([header, body, Buffer.from(xref, 'binary'), Buffer.from(trailer, 'binary')])
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Polls GET /api/files/{fileId}/index-status until status is COMPLETED or FAILED.
 * Returns the resolved status string, or 'TIMEOUT' if the timeout is exceeded.
 */
async function waitForIndexStatus(
  fileId: string,
  token: string,
  timeoutMs = 90_000,
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(`/api/files/${fileId}/index-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const status: string = res.data.status
      if (status === 'COMPLETED' || status === 'FAILED') return status
    } catch {
      // backend may still be processing; retry
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return 'TIMEOUT'
}

function getWsConnection(token: string) {
  const httpBase = axios.defaults.baseURL ?? 'http://localhost:3000'
  return {
    host: `${httpBase.replace(/^http/, 'ws')}/api`,
    headers: { authorization: `Bearer ${token}` },
  }
}

async function waitForWsTerminalStatus(
  snapshots: FilesDto.IndexStatusResponse[],
  timeoutMs = 90_000,
): Promise<FilesDto.IndexStatusResponse> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const last = snapshots.at(-1)
    if (last && (last.status === 'COMPLETED' || last.status === 'FAILED')) {
      return last
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('WebSocket index-status stream did not reach terminal status in time')
}

// ─── E2E Tests ────────────────────────────────────────────────────────────
// Matches the 10 test scenarios from .tmp/nextcloud-ai-chat.md §Final Verification

describe('Nextcloud AI Chat - 10 E2E Tests', () => {
  let tokenA: string
  let tokenB: string
  let fileId: string
  let tenantIdA: string
  let uploadedFileSize: number

  // ── Test 1: tenant-a 로그인 ──────────────────────────────────────────────
  it('1. should login as tenant-a admin and return access token + user info', async () => {
    const res = await axios.post('/api/auth/login', {
      email: 'user-a1@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(201)
    expect(res.data.accessToken).toBeTruthy()
    expect(typeof res.data.accessToken).toBe('string')
    expect(res.data.user).toMatchObject({
      email: 'user-a1@example.com',
      role: 'admin',
    })

    tokenA = res.data.accessToken
    tenantIdA = res.data.user.tenantId
  })

  // ── Test 2: tenant-b 파일 접근 차단 (TenantGuard) ────────────────────────
  it('2. should reject cross-tenant file access with 403 Forbidden', async () => {
    // First login as tenant-b user to confirm tenant-b auth works
    const loginB = await axios.post('/api/auth/login', {
      email: 'user-b1@example.com',
      password: 'password123',
    })
    tokenB = loginB.data.accessToken
    expect(tokenB).toBeTruthy()

    // tenant-a 토큰으로 tenant-b 의 파일 목록 조회 → 403
    let caught = false
    try {
      await axios.get('/api/tenants/tenant-b/files', {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    } catch (err: unknown) {
      caught = true
      expect((err as { response?: { status: number } }).response?.status).toBe(403)
    }
    expect(caught).toBe(true)
  })

  // ── Test 3: PDF 업로드 → PENDING 상태 확인 ──────────────────────────────
  it('3. should upload a PDF file and return document with PENDING status', async () => {
    const pdfBuffer = createTestPdf()
    const form = new FormData()
    form.append('file', pdfBuffer, {
      filename: 'e2e-test-document.pdf',
      contentType: 'application/pdf',
    })

    const res = await axios.post('/api/tenants/tenant-a/files', form, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        ...form.getHeaders(),
      },
    })

    expect(res.status).toBe(201)
    expect(res.data.documentId).toBeTruthy()
    expect(res.data.fileName).toBe('e2e-test-document.pdf')
    expect(res.data.indexStatus).toBe('PENDING')

    fileId = res.data.documentId
    uploadedFileSize = res.data.fileSize
  })

  // ── Test 4: 인덱싱 완료 (WebSocket 스트림 + 메타데이터) ───────────────────
  it('4. should complete indexing with WebSocket status stream', async () => {
    const snapshots: FilesDto.IndexStatusResponse[] = []
    const session = await api.functional.files.index_status.indexStatusWs(
      getWsConnection(tokenA),
      fileId,
      {
        onStatus: (snapshot) => {
          snapshots.push(snapshot)
        },
      },
    )

    const terminal = await waitForWsTerminalStatus(snapshots)
    await session.driver.stop()
    await session.connector.close()

    expect(snapshots.length).toBeGreaterThan(0)
    expect(terminal.status).toBe('COMPLETED')
    expect(terminal.pageCount).toBeGreaterThanOrEqual(1)
    expect(terminal.chunkCount).toBeGreaterThanOrEqual(1)
  })

  // ── Test 4b: 완료된 문서 retry 거부 ─────────────────────────────────────
  it('4b. should reject retry on a completed document', async () => {
    let caught = false
    try {
      await axios.post(
        `/api/files/${fileId}/retry`,
        {},
        { headers: { Authorization: `Bearer ${tokenA}` } },
      )
    } catch (err: unknown) {
      caught = true
      expect((err as { response?: { status: number } }).response?.status).toBe(400)
    }
    expect(caught).toBe(true)
  })

  // ── Test 4c: 업로드 직후 retry 허용 ─────────────────────────────────────
  it('4c. should accept retry on a newly uploaded document', async () => {
    const pdfBuffer = createTestPdf()
    const form = new FormData()
    form.append('file', pdfBuffer, {
      filename: 'e2e-retry-document.pdf',
      contentType: 'application/pdf',
    })

    const uploadRes = await axios.post('/api/tenants/tenant-a/files', form, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        ...form.getHeaders(),
      },
    })

    const retryRes = await axios.post(
      `/api/files/${uploadRes.data.documentId}/retry`,
      {},
      { headers: { Authorization: `Bearer ${tokenA}` } },
    )

    expect(retryRes.status).toBeGreaterThanOrEqual(200)
    expect(retryRes.status).toBeLessThan(300)
    expect(typeof retryRes.data.action).toBe('string')
    expect(typeof retryRes.data.message).toBe('string')

    await waitForIndexStatus(uploadRes.data.documentId, tokenA)
  })

  // ── Test 5: 파일 목록 조회 (업로드된 파일 포함 확인) ─────────────────────
  // Replaces the frontend-only test 5 from the plan.
  it('5. should list files for tenant-a including the uploaded document', async () => {
    const res = await axios.get('/api/tenants/tenant-a/files', {
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data.length).toBeGreaterThanOrEqual(1)

    const match = res.data.find((f: { documentId: string }) => f.documentId === fileId)
    expect(match).toBeDefined()
    expect(match.fileName).toBe('e2e-test-document.pdf')
    expect(match.indexStatus).toBe('COMPLETED')
    expect(typeof match.fileSize).toBe('number')
  })

  // ── Test 6: 문서 기반 AI 채팅 (RAG) ─────────────────────────────────────
  it('6. should answer a document-related question with sources', async () => {
    const res = await axios.post(
      `/api/files/${fileId}/chat`,
      { question: 'What technology does this system use to answer questions?' },
      { headers: { Authorization: `Bearer ${tokenA}` } },
    )

    expect(res.status).toBe(200)
    expect(res.data.answer).toBeTruthy()
    expect(typeof res.data.answer).toBe('string')
    expect(typeof res.data.sessionId).toBe('string')

    // Should have sources with metadata
    expect(Array.isArray(res.data.sources)).toBe(true)

    if (res.data.sources.length > 0) {
      const src = res.data.sources[0]
      expect(src.fileName).toBeTruthy()
      expect(typeof src.pageNo).toBe('number')
      expect(typeof src.paragraphNo).toBe('number')
      expect(typeof src.text).toBe('string')
      expect(typeof src.similarity).toBe('number')
      if (src.bbox) {
        expect(typeof src.bbox.x).toBe('number')
        expect(typeof src.bbox.y).toBe('number')
        expect(typeof src.bbox.width).toBe('number')
        expect(typeof src.bbox.height).toBe('number')
        expect(src.bbox.width).toBeGreaterThan(0)
        expect(src.bbox.height).toBeGreaterThan(0)
      }
    }
  })

  // ── Test 7: 문서 외 질문 → "문서에서 확인 불가" (검색 청크는 있을 수 있음) ─
  it('7. should return "문서에서 확인 불가" for unrelated questions', async () => {
    const res = await axios.post(
      `/api/files/${fileId}/chat`,
      { question: 'What is the weather in Seoul today?' },
      { headers: { Authorization: `Bearer ${tokenA}` } },
    )

    expect(res.status).toBe(200)
    expect(res.data.answer).toContain('문서에서 확인 불가')

    if (res.data.sources.length === 0) {
      expect(['NO_RELEVANT_CHUNKS', 'LLM_API_FAILED']).toContain(res.data.diagnostics?.reason)
      return
    }

    // 임베딩이 약하게 매칭된 청크를 반환해도 LLM이 문서 근거 없음으로 답할 수 있다.
    expect(Array.isArray(res.data.sources)).toBe(true)
    for (const source of res.data.sources) {
      expect(typeof source.pageNo).toBe('number')
      expect(typeof source.paragraphNo).toBe('number')
      expect(typeof source.similarity).toBe('number')
    }
  })

  // ── Test 7b: 폴더 RAG 채팅 ───────────────────────────────────────────────
  it('7b. should answer folder chat using documents in the same folder', async () => {
    const folderId = 'e2e-demo-folder'
    const pdfBuffer = createTestPdf()
    const form = new FormData()
    form.append('file', pdfBuffer, {
      filename: 'e2e-folder-document.pdf',
      contentType: 'application/pdf',
    })
    form.append('folderId', folderId)

    const uploadRes = await axios.post('/api/tenants/tenant-a/files', form, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        ...form.getHeaders(),
      },
    })

    const folderFileId = uploadRes.data.documentId as string
    const folderStatus = await waitForIndexStatus(folderFileId, tokenA)
    expect(folderStatus).toBe('COMPLETED')

    const res = await axios.post(
      `/api/folders/${encodeURIComponent(folderId)}/chat`,
      { question: 'What technology does this system use to answer questions?' },
      { headers: { Authorization: `Bearer ${tokenA}` } },
    )

    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
    expect(typeof res.data.answer).toBe('string')
    expect(Array.isArray(res.data.sources)).toBe(true)
    expect(res.data.documentCount).toBeGreaterThanOrEqual(1)

    if (res.data.sources.length > 0) {
      expect(res.data.sources[0].documentId).toBeTruthy()
      expect(res.data.sources[0].fileName).toBeTruthy()
    }
  })

  // ── Test 7c: 폴더 채팅 환각 억제 + diagnostics ─────────────────────────────
  it('7c. should return folder chat diagnostics when no relevant chunks', async () => {
    const folderId = 'e2e-folder-no-match'
    const pdfBuffer = createTestPdf()
    const form = new FormData()
    form.append('file', pdfBuffer, {
      filename: 'e2e-folder-no-match.pdf',
      contentType: 'application/pdf',
    })
    form.append('folderId', folderId)

    const uploadRes = await axios.post('/api/tenants/tenant-a/files', form, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        ...form.getHeaders(),
      },
    })

    const folderFileId = uploadRes.data.documentId as string
    expect(await waitForIndexStatus(folderFileId, tokenA)).toBe('COMPLETED')

    const res = await axios.post(
      `/api/folders/${encodeURIComponent(folderId)}/chat`,
      { question: 'What is the weather in Seoul today?' },
      { headers: { Authorization: `Bearer ${tokenA}` } },
    )

    expect(res.status).toBe(200)
    expect(res.data.answer).toContain('문서에서 확인 불가')

    if (res.data.sources.length === 0) {
      expect(res.data.diagnostics?.reason).toBe('NO_RELEVANT_CHUNKS')
    }
  })

  // ── Test 8: 관리자 사용량 조회 (앱 DB documents.file_size 기준) ─────────
  it('8. should return users-usage with app DB usedBytes per user', async () => {
    const res = await axios.get(`/api/admin/tenants/${tenantIdA}/users-usage`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(res.status).toBe(200)
    expect(res.data.tenantId).toBe(tenantIdA)
    expect(Array.isArray(res.data.users)).toBe(true)
    expect(res.data.users.length).toBeGreaterThanOrEqual(1)

    const userA1 = res.data.users.find((u: { email: string }) => u.email === 'user-a1@example.com')
    expect(userA1).toBeDefined()
    expect(typeof userA1.usedBytes).toBe('number')
    expect(typeof userA1.quotaBytes).toBe('number')
    expect(typeof userA1.usagePercent).toBe('number')
    expect(userA1.lastCollectedAt).toBeTruthy()
    expect(userA1.usedBytes).toBeGreaterThanOrEqual(uploadedFileSize)
    expect(res.data.lastCollectedAt).toBeTruthy()
  })

  it('8b. should list tenants for admin', async () => {
    const res = await axios.get('/api/admin/tenants', {
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.tenants)).toBe(true)
    expect(res.data.tenants.length).toBeGreaterThanOrEqual(2)
  })

  // ── Test 9: 로그인 실패 (잘못된 비밀번호) ────────────────────────────────
  it('9. should reject login with wrong password', async () => {
    let caught = false
    try {
      await axios.post('/api/auth/login', {
        email: 'user-a1@example.com',
        password: 'wrong-password-1234',
      })
    } catch (err: unknown) {
      caught = true
      expect((err as { response?: { status: number } }).response?.status).toBeGreaterThanOrEqual(
        400,
      )
    }
    expect(caught).toBe(true)
  })

  // ── Test 10: 할당량 조회 (인증된 GET 엔드포인트) ─────────────────────────
  it('10. should return quota information for authenticated user', async () => {
    const res = await axios.get('/api/auth/quota', {
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(res.status).toBe(200)
    expect(typeof res.data.usedBytes).toBe('number')
    expect(typeof res.data.quotaBytes).toBe('number')
    expect(typeof res.data.usagePercent).toBe('number')
  })
})
