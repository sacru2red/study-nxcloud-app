# Document AI Chat - Nextcloud 기반 문서 AI 채팅 시스템

Nextcloud를 파일 저장소로 활용한 멀티테넌트 문서 AI 채팅 시스템. PDF 업로드 → 자동 인덱싱 → RAG 기반 질의응답.

## 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │  Sidebar  │  │  PdfViewer   │  │         ChatPanel            │  │
│  │  w-72     │  │  flex-1      │  │  w-96                        │  │
│  │           │  │              │  │  ┌────────────────────────┐  │  │
│  │  파일목록 │  │  iframe      │  │  │  메시지 버블           │  │  │
│  │  업로드   │  │  페이지이동  │  │  │  SourceCard(근거)      │  │  │
│  └────┬──────┘  └──────┬───────┘  │  └────────────────────────┘  │  │
│       │                │          │  ┌────────────────────────┐  │  │
│       │                │          │  │  질문 입력 → 전송      │  │  │
│       │                │          │  └────────────────────────┘  │  │
│       └────────────────┼──────────┘                              │  │
│                        │                                         │  │
└────────────────────────┼─────────────────────────────────────────┘
                         │ HTTP /api (Vite proxy → localhost:3000)
                         │
┌────────────────────────┼─────────────────────────────────────────┐
│              Backend (NestJS + Nestia)                            │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Auth     │  │ Files    │  │ Admin    │  │ Chat             │ │
│  │ Controller│  │Controller│  │Controller│  │ Controller       │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬──────────┘ │
│       │              │             │                │            │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐  ┌───────┴──────────┐ │
│  │ Auth     │  │ Files    │  │ Admin    │  │ Chat Provider    │ │
│  │ Provider │  │ Provider │  │ Provider │  │ (RAG Pipeline)   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬──────────┘ │
│       │              │             │                │            │
│       └──────────────┼─────────────┘                │            │
│                      │                              │            │
│  ┌───────────────────┴──────────────────────────────────┐       │
│  │              Nextcloud Provider (WebDAV + OCS)       │       │
│  │  uploadFile / listFiles / getFile / getUserQuota     │       │
│  └───────────────────────┬──────────────────────────────┘       │
│                          │                                      │
│  ┌───────────────────────┴──────────────────────────────┐       │
│  │              PDF Worker Provider                      │       │
│  │  pdf-parse → chunk(500/100 overlap) → Embedding      │       │
│  └───────────────────────┬──────────────────────────────┘       │
│                          │                                      │
│  ┌───────────────────────┴──────────────────────────────┐       │
│  │  Embedding Provider  │  LLM Provider                 │       │
│  │  Gemini API → pgvector│  opencode zen → RAG 응답    │       │
│  └───────────────────────┴──────────────────────────────┘       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
         │                     │
         ▼                     ▼
┌─────────────────┐  ┌──────────────────┐
│  PostgreSQL     │  │  Nextcloud       │
│  + pgvector     │  │  (File Storage)  │
│                 │  │                  │
│  tenants        │  │  /tenant-a/      │
│  users          │  │  /tenant-b/      │
│  documents      │  │                  │
│  document_chunks│  │  OCS API → quota │
│  (vector(768))  │  │  WebDAV → 파일   │
│  chat_sessions  │  │                  │
│  chat_messages  │  │                  │
└─────────────────┘  └──────────────────┘
```

### 데이터 모델 (ERD)

#### Tenants ← Users ← Documents ← Document Chunks

```
tenants (tenant_id PK)
  │
  ├─ users (user_id PK, tenant_id FK)
  │    ├─ documents (document_id PK, tenant_id FK, owner_user_id FK)
  │    │    └─ document_chunks (chunk_id PK, document_id FK, tenant_id FK)
  │    │         └─ embedding: vector(768) ← pgvector
  │    └─ chat_sessions (session_id PK, tenant_id FK, user_id FK, document_id FK)
  │         └─ chat_messages (message_id PK, session_id FK)
```

#### 테넌트 격리

- 모든 테이블에 `tenant_id` 컬럼 포함
- API 레벨에서 `TenantGuard`가 JWT의 tenantId와 URL의 tenantId 일치 검증
- DB 쿼리 시 항상 `WHERE tenant_id = ?` 조건 포함

### RAG (Retrieval-Augmented Generation) 파이프라인

```
사용자 질문
    │
    ▼
[1] EmbeddingService.generateEmbedding(question)
    │ → Gemini gemini-embedding-001 API (768d)
    │ → 768차원 벡터
    ▼
[2] pgvector 유사도 검색
    │ → SELECT ..., 1 - (embedding <=> $1::vector) as similarity
    │ → WHERE tenant_id = ? AND document_id = ?
    │ → ORDER BY embedding <=> $1::vector LIMIT 5
    │ → similarity >= 0.3 필터
    ▼
[3] 컨텍스트 조합
    │ → 검색된 chunk_text를 \n\n 으로 결합
    ▼
[4] LLM 호출
    │ → System Prompt: "문서 내용만 근거로 답변. 없으면 '문서에서 확인 불가'"
    │ → User Message: [문서 내용] + [질문]
    │ → model: google/gemma-3-27b-it:free
    ▼
[5] 응답 + 근거 반환
    │ → answer: LLM 응답 텍스트
    │ → sources: [{fileName, pageNo, paragraphNo, text(200자), similarity}]
    │ → chat_messages에 저장
```

### PDF 인덱싱 파이프라인

```
파일 업로드
    │
    ▼
[1] Nextcloud WebDAV PUT (/files/admin/{tenantId}/{fileName})
    │ → documents INSERT (status: PENDING)
    ▼
[2] PdfWorker.processDocument(documentId)
    │ → status: PROCESSING으로 변경
    │ → Nextcloud에서 파일 다운로드
    ▼
[3] pdf-parse 로 텍스트 추출
    │ → 페이지별 분리 (\f 구분자)
    ▼
[4] 청크 분해
    │ → 500자 단위, 100자 overlap
    │ → 각 청크: {pageNo, paragraphNo, chunkText}
    │ → document_chunks INSERT
    ▼
[5] Gemini Embedding 생성
    │ → 50개 배치, 1초 간격 rate limiting
    │ → pgvector UPDATE (embedding 컬럼)
    ▼
[6] 완료 처리
    │ → status: COMPLETED
    │ → pageCount, chunkCount 업데이트
```

### 보안 / 권한

#### 인증 (JWT)

- `POST /api/auth/login` → email + password → JWT 발급
- JWT payload: `{ userId, tenantId, email, role }`
- 만료: 24시간 (`.env`에서 설정 가능)
- Passport 없이 `JwtService` 직접 검증

#### 인가 (Guards)

- **JwtAuthGuard**: 모든 보호된 엔드포인트에 적용
- **TenantGuard**: URL의 `:tenantId`와 JWT의 `tenantId` 비교
- **Role Check**: Admin 엔드포인트에서 `user.role === 'admin'` 검증

#### 테넌트 데이터 격리

- 모든 DB 쿼리에 `tenant_id` WHERE 조건 포함
- Vector DB 검색에도 `tenant_id` 필터 적용
- 파일 접근 시 소유권 + 테넌트 이중 검증

### 기술 스택

| Category     | Technology                        |
| ------------ | --------------------------------- |
| Monorepo     | Nx 22.7                           |
| Backend      | NestJS 11 + Nestia 11             |
| Frontend     | React 19 + Vite 8 + TailwindCSS 3 |
| Database     | PostgreSQL 16 + pgvector          |
| File Storage | Nextcloud (WebDAV + OCS API)      |
| Embedding    | Gemini gemini-embedding-001 (768d) |
| LLM          | opencode zen                      |
| Auth         | JWT (bcrypt + @nestjs/jwt)        |
| State        | jotai + @tanstack/react-query     |
| Router       | @tanstack/react-router            |
| SDK          | typia + @nestia/core              |

## 문서

| 문서 | 설명 |
| ---- | ---- |
| [RESULT_OUTLINE.md](./RESULT_OUTLINE.md) | 과제 요구사항 대비 구현·진행·제출 준비 현황 |
| [docs/submission-tasks.md](./docs/submission-tasks.md) | 제출·시연 할 일과 방법 (대화 정리) |
| [docs/development.md](./docs/development.md) | 로컬 환경 설정, 개발 서버, E2E 테스트 |
| [docs/api-examples.md](./docs/api-examples.md) | API 응답 예시 |
| [docs/nestia-guide.md](./docs/nestia-guide.md) | Nestia 사용 가이드 |

## API Endpoints

| Method | Endpoint                                   | Description            | Auth         |
| ------ | ------------------------------------------ | ---------------------- | ------------ |
| POST   | `/api/auth/login`                          | 로그인                 | -            |
| GET    | `/api/auth/quota`                          | 사용자 저장공간 할당량 | JWT          |
| POST   | `/api/tenants/:tenantId/files`             | PDF 업로드             | JWT + Tenant |
| GET    | `/api/tenants/:tenantId/files`             | 파일 목록              | JWT + Tenant |
| GET    | `/api/files/:fileId/index-status`          | 인덱싱 상태            | JWT          |
| POST   | `/api/files/:fileId/chat`                  | AI 채팅 질문           | JWT          |
| GET    | `/api/admin/tenants/:tenantId/users-usage` | 사용량 조회            | JWT + Admin  |
