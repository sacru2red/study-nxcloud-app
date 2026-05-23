# API 응답 예시

## 1. 로그인

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user-a1@example.com",
  "password": "password123"
}
```

**Response 200:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user-a1@example.com",
    "tenantId": "660e8400-e29b-41d4-a716-446655440001",
    "role": "admin"
  }
}
```

**Response 401:**

```json
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

---

## 2. 사용자 할당량 조회

```http
GET /api/auth/quota
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response 200:**

```json
{
  "usedBytes": 52428800,
  "quotaBytes": 104857600,
  "usagePercent": 50
}
```

---

## 3. 파일 업로드

```http
POST /api/tenants/tenant-a/files
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: multipart/form-data

file: @report.pdf
```

**Response 201:**

```json
{
  "documentId": "770e8400-e29b-41d4-a716-446655440002",
  "tenantId": "660e8400-e29b-41d4-a716-446655440001",
  "fileName": "report.pdf",
  "ncPath": "/files/admin/tenant-a/report.pdf",
  "ncDownloadUrl": "http://localhost:8081/remote.php/dav/files/admin/tenant-a/report.pdf",
  "fileSize": 2456789,
  "mimeType": "application/pdf",
  "indexStatus": "PENDING",
  "pageCount": 0,
  "chunkCount": 0,
  "createdAt": "2026-05-15T10:30:00.000Z",
  "indexedAt": null
}
```

---

## 4. 파일 목록

```http
GET /api/tenants/tenant-a/files
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response 200:**

```json
[
  {
    "documentId": "770e8400-e29b-41d4-a716-446655440002",
    "tenantId": "660e8400-e29b-41d4-a716-446655440001",
    "fileName": "report.pdf",
    "ncPath": "/files/admin/tenant-a/report.pdf",
    "ncDownloadUrl": "http://localhost:8081/remote.php/dav/files/admin/tenant-a/report.pdf",
    "fileSize": 2456789,
    "mimeType": "application/pdf",
    "indexStatus": "COMPLETED",
    "pageCount": 12,
    "chunkCount": 48,
    "createdAt": "2026-05-15T10:30:00.000Z",
    "indexedAt": "2026-05-15T10:31:30.000Z"
  }
]
```

---

## 5. 인덱싱 상태

```http
GET /api/files/770e8400-e29b-41d4-a716-446655440002/index-status
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response 200 (진행 중):**

```json
{
  "documentId": "770e8400-e29b-41d4-a716-446655440002",
  "status": "PROCESSING",
  "pageCount": 0,
  "chunkCount": 0
}
```

**Response 200 (완료):**

```json
{
  "documentId": "770e8400-e29b-41d4-a716-446655440002",
  "status": "COMPLETED",
  "pageCount": 12,
  "chunkCount": 48
}
```

---

## 6. AI 채팅

```http
POST /api/files/770e8400-e29b-41d4-a716-446655440002/chat
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "question": "이 문서의 주요 내용은 무엇인가요?"
}
```

**Response 200:**

```json
{
  "answer": "이 문서는 2025년도 상반기 영업 실적 보고서로, 주요 내용은 다음과 같습니다: 1) 전체 매출이 전년 대비 15% 성장한 1,250억 원을 기록했습니다. 2) 신규 고객사는 45개사 증가했습니다. 3) 주요 성장 동력은 클라우드 서비스 부문으로 32% 성장했습니다.",
  "sources": [
    {
      "fileName": "report.pdf",
      "pageNo": 1,
      "paragraphNo": 0,
      "text": "2025년도 상반기 영업 실적 보고서...",
      "similarity": 0.923,
      "bbox": { "x": 72, "y": 680, "width": 460, "height": 24 }
    },
    {
      "fileName": "report.pdf",
      "pageNo": 2,
      "paragraphNo": 1,
      "text": "부문별 실적을 살펴보면 클라우드 서비스 부문이...",
      "similarity": 0.856
    }
  ],
  "sessionId": "880e8400-e29b-41d4-a716-446655440003"
}
```

`bbox`는 PDF user space(원점 좌하) 기준이며, 재인덱싱 전 문서·pdf-parse 폴백 인덱싱에서는 생략될 수 있습니다.

---

## 7. 문서 외 질문 (환각 억제)

```http
POST /api/files/770e8400-e29b-41d4-a716-446655440002/chat
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "question": "이 문서의 저자는 누구인가요?"
}
```

**Response 200 (문서에 없음):**

```json
{
  "answer": "문서에서 확인 불가",
  "sources": [],
  "sessionId": "990e8400-e29b-41d4-a716-446655440004",
  "diagnostics": { "reason": "NO_RELEVANT_CHUNKS" }
}
```

---

## 8. 관리자 사용량 조회

```http
GET /api/admin/tenants/tenant-a/users-usage
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response 200:** (`user-a1` usedBytes는 `init-nextcloud.sh`의 ~52MB 샘플 업로드 후 실측값; 아래는 예시)

```json
{
  "tenantId": "660e8400-e29b-41d4-a716-446655440001",
  "users": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user-a1@example.com",
      "ncUserId": "user-a1",
      "role": "admin",
      "usedBytes": 52428800,
      "quotaBytes": 104857600,
      "usagePercent": 50
    },
    {
      "userId": "aa0e8400-e29b-41d4-a716-446655440005",
      "email": "user-a2@example.com",
      "ncUserId": "user-a2",
      "role": "user",
      "usedBytes": 10485760,
      "quotaBytes": 104857600,
      "usagePercent": 10
    }
  ]
}
```

---

## 9. 테넌트 격리 - 권한 없음

```http
GET /api/tenants/tenant-b/files
Authorization: Bearer eyJhbGciOiJIUzI1NiIs... (tenant-a 토큰)
```

**Response 403:**

```json
{
  "statusCode": 403,
  "message": "You do not have access to this tenant resources"
}
```

---

## 10. Admin — Tenant 목록

```http
GET /api/admin/tenants
Authorization: Bearer <admin JWT>
```

**Response 200:**

```json
{
  "tenants": [
    {
      "tenantId": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Tenant A",
      "ncGroupId": "tenant-a"
    }
  ]
}
```

---

## 11. Admin — 사용자 사용량 (lastCollectedAt)

```http
GET /api/admin/tenants/{tenantId}/users-usage
Authorization: Bearer <admin JWT>
```

**Response 200:**

```json
{
  "tenantId": "660e8400-e29b-41d4-a716-446655440001",
  "lastCollectedAt": "2026-05-20T10:00:00.000Z",
  "users": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user-a1@example.com",
      "ncUserId": "user-a1",
      "role": "admin",
      "usedBytes": 52428800,
      "quotaBytes": 104857600,
      "usagePercent": 50,
      "lastCollectedAt": "2026-05-20T10:00:00.000Z"
    }
  ]
}
```

---

## 12. 폴더 RAG 채팅

```http
POST /api/folders/{folderId}/chat
Authorization: Bearer <JWT>
Content-Type: application/json

{ "question": "이 폴더 문서들의 공통 주제는?" }
```

**Response 200:** `answer`, `sources[]`, `sessionId`, `documentCount` (단일 파일 chat과 유사, source에 `documentId` 포함 가능)

---

## 13. 채팅 diagnostics (선택 필드)

```json
{
  "answer": "문서에서 확인 불가",
  "sources": [],
  "sessionId": "550e8400-e29b-41d4-a716-446655440099",
  "diagnostics": {
    "reason": "EMBEDDING_FAILED"
  }
}
```

---

## 14. 인증 실패

```http
GET /api/tenants/tenant-a/files
```

**Response 401:**

```json
{
  "statusCode": 401,
  "message": "Missing authorization token"
}
```
