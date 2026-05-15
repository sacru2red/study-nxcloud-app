import axios from 'axios'
import FormData from 'form-data'

// ─── Minimal PDF Generator ────────────────────────────────────────────────
// Generates a byte-valid minimal PDF with extractable text content for RAG testing.
function createTestPdf(): Buffer {
  const textContent =
    'Document AI Chat System: This system allows users to upload PDF documents and ask questions about their content. ' +
    'It uses RAG (Retrieval-Augmented Generation) technology to find relevant information and generate accurate answers. ' +
    'The system supports multi-tenant environments with complete data isolation between tenants. ' +
    'Documents are stored in Nextcloud and processed using AI embeddings stored in pgvector.'

  const objects: { lines: string[] }[] = [
    {
      lines: ['1 0 obj', '<< /Type /Catalog /Pages 2 0 R >>', 'endobj'],
    },
    {
      lines: ['2 0 obj', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'endobj'],
    },
    {
      lines: [
        '3 0 obj',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        'endobj',
      ],
    },
    {
      lines: (() => {
        const streamData = `BT /F1 24 Tf 100 700 Td(${textContent}) Tj ET`
        const length = Buffer.byteLength(streamData, 'binary')
        return ['4 0 obj', `<< /Length ${length} >>`, 'stream', streamData, 'endstream', 'endobj']
      })(),
    },
    {
      lines: ['5 0 obj', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'endobj'],
    },
  ]

  const header = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'
  const bodyParts: string[] = []
  for (const obj of objects) {
    bodyParts.push(obj.lines.join('\n'))
  }
  const bodyStr = bodyParts.join('\n\n')

  const preXref = header + bodyStr + '\n'

  const offsets: number[] = [0]
  for (let i = 1; i <= objects.length; i++) {
    const marker = `${i} 0 obj`
    const idx = preXref.indexOf(marker)
    offsets.push(idx)
  }

  const totalEntries = objects.length + 1

  const xrefEntries = [
    '0000000000 65535 f ',
    ...offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n '),
  ]

  const xrefSection = `xref\n0 ${totalEntries}\n${xrefEntries.join('\n')}\n`
  const xrefOffset = Buffer.byteLength(preXref, 'binary')

  const trailer = `trailer\n<< /Size ${totalEntries} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(preXref + xrefSection + trailer, 'binary')
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

// ─── E2E Tests ────────────────────────────────────────────────────────────
// Matches the 10 test scenarios from .tmp/nextcloud-ai-chat.md §Final Verification

describe('Nextcloud AI Chat - 10 E2E Tests', () => {
  let tokenA: string
  let tokenB: string
  let fileId: string
  let tenantIdA: string

  // ── Test 1: tenant-a 로그인 ──────────────────────────────────────────────
  it('1. should login as tenant-a admin and return access token + user info', async () => {
    const res = await axios.post('/api/auth/login', {
      email: 'user-a1@datco.kr',
      password: 'password123',
    })

    expect(res.status).toBe(200)
    expect(res.data.accessToken).toBeTruthy()
    expect(typeof res.data.accessToken).toBe('string')
    expect(res.data.user).toMatchObject({
      email: 'user-a1@datco.kr',
      role: 'admin',
    })

    tokenA = res.data.accessToken
    tenantIdA = res.data.user.tenantId
  })

  // ── Test 2: tenant-b 파일 접근 차단 (TenantGuard) ────────────────────────
  it('2. should reject cross-tenant file access with 403 Forbidden', async () => {
    // First login as tenant-b user to confirm tenant-b auth works
    const loginB = await axios.post('/api/auth/login', {
      email: 'user-b1@datco.kr',
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
    } catch (err: any) {
      caught = true
      expect(err.response?.status).toBe(403)
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
  })

  // ── Test 4: 인덱싱 완료 (비동기 처리 완료까지 폴링) ─────────────────────
  it('4. should complete indexing (COMPLETED with pageCount and chunkCount)', async () => {
    const status = await waitForIndexStatus(fileId, tokenA)

    expect(status).toBe('COMPLETED')

    // Confirm metadata after indexing
    const res = await axios.get(`/api/files/${fileId}/index-status`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    expect(res.data.pageCount).toBeGreaterThanOrEqual(1)
    expect(res.data.chunkCount).toBeGreaterThanOrEqual(1)
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

    const match = res.data.find((f: any) => f.documentId === fileId)
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
    }
  })

  // ── Test 7: 문서 외 질문 → 환각 억제 ("문서에서 확인 불가") ──────────────
  it('7. should return "문서에서 확인 불가" for out-of-document questions', async () => {
    const res = await axios.post(
      `/api/files/${fileId}/chat`,
      { question: 'What is the weather in Seoul today?' },
      { headers: { Authorization: `Bearer ${tokenA}` } },
    )

    expect(res.status).toBe(200)
    expect(res.data.answer).toContain('문서에서 확인 불가')
    expect(res.data.sources).toEqual([])
  })

  // ── Test 8: 관리자 사용량 조회 ───────────────────────────────────────────
  it('8. should return users-usage for admin user (usagePercent per user)', async () => {
    const res = await axios.get(`/api/admin/tenants/${tenantIdA}/users-usage`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })

    expect(res.status).toBe(200)
    expect(res.data.tenantId).toBe(tenantIdA)
    expect(Array.isArray(res.data.users)).toBe(true)
    expect(res.data.users.length).toBeGreaterThanOrEqual(1)

    const first = res.data.users[0]
    expect(first.email).toBeTruthy()
    expect(typeof first.usedBytes).toBe('number')
    expect(typeof first.quotaBytes).toBe('number')
    expect(typeof first.usagePercent).toBe('number')
  })

  // ── Test 9: 로그인 실패 (잘못된 비밀번호) ────────────────────────────────
  it('9. should reject login with wrong password', async () => {
    let caught = false
    try {
      await axios.post('/api/auth/login', {
        email: 'user-a1@datco.kr',
        password: 'wrong-password-1234',
      })
    } catch (err: any) {
      caught = true
      expect(err.response?.status).toBeGreaterThanOrEqual(400)
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
