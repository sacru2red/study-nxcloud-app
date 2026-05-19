# Document AI Chat - Nextcloud 기반 문서 AI 채팅 시스템

Nextcloud를 파일 저장소로 활용한 멀티테넌트 문서 AI 채팅 시스템. PDF 업로드 → 자동 인덱싱 → RAG 기반 질의응답.

## Demo

> PDF(`202212301672357894280.pdf`)를 업로드하고 **"하이브리드 자동차가 무엇인가요?"** 라고 질문하는 전체 흐름입니다.

### Screenshots

| #     | 화면                        | 이미지                                                                 |
| ----- | --------------------------- | ---------------------------------------------------------------------- |
| 1     | 로그인                      | ![Login](docs/screenshots/01-login.png)                                |
| 2     | PDF 업로드                  | ![Upload](docs/screenshots/02-upload-pdf.png)                          |
| 3     | 인덱싱 완료                 | ![Index completed](docs/screenshots/03-index-completed.png)            |
| 4     | 메인 레이아웃 (PDF 뷰어)    | ![Main layout](docs/screenshots/04-main-layout.png)                    |
| 5-1   | AI 채팅 (RAG 질문·근거)     | ![Chat with sources](docs/screenshots/05-1-chat-with-sources.png)      |
| 5-1-1 | 근거 카드 → PDF 페이지 이동 | ![Source page navigation](docs/screenshots/05-1-1-source-page-nav.png) |
| 5-2   | AI 채팅 (추가 질문)         | ![Chat follow-up](docs/screenshots/05-2-chat-with-sources.png)         |
| 6     | 문서에 없는 질문            | ![Chat no source](docs/screenshots/06-chat-no-source.png)              |
| 7     | 관리자 대시보드             | ![Admin usage](docs/screenshots/07-admin-usage.png)                    |

### Video

E2E 데모 녹화 합본 (`docs/demo-capture.webm`):

<video controls src="docs/demo-capture.webm" width="720"></video>

[동영상 파일 직접 열기](./docs/demo-capture.webm)

### 데모 재생성

스크린샷·동영상을 다시 만들 때:

```bash
npx nx run frontend-e2e:capture-demo
node tools/concat-demo-videos.js
```

Playwright가 `docs/screenshots/`에 PNG를 저장하고, 개별 시나리오별 `test-results/` WebM을 합쳐 `docs/demo-capture.webm`을 생성합니다. 저장소에는 위 경로의 산출물을 커밋합니다.

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
    │ → model: minimax-m2.5-free
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

| Category     | Technology                         |
| ------------ | ---------------------------------- |
| Monorepo     | Nx 22.7                            |
| Backend      | NestJS 11 + Nestia 11              |
| Frontend     | React 19 + Vite 8 + TailwindCSS 3  |
| Database     | PostgreSQL 16 + pgvector           |
| File Storage | Nextcloud (WebDAV + OCS API)       |
| Embedding    | Gemini gemini-embedding-001 (768d) |
| LLM          | opencode zen                       |
| Auth         | JWT (bcrypt + @nestjs/jwt)         |
| State        | jotai + @tanstack/react-query      |
| Router       | @tanstack/react-router             |
| SDK          | typia + @nestia/core               |

## 문서

| 문서　　　　　　　　　　　　　　　　　　　　　　　　　　　　 | 설명　　　　　　　　　　　　　　　　　　　　　　　　 |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| [docs/development.md](./docs/development.md)　　　　　　　　 | 로컬 환경 설정, 개발 서버, E2E 테스트　　　　　　　  |
| [docs/deploy-oracle-cloud.md](./docs/deploy-oracle-cloud.md) | Oracle Cloud 무료 VM 모놀리식 배포 (Docker Compose)  |
| [docs/api-examples.md](./docs/api-examples.md)　　　　　　　 | API 응답 예시　　　　　　　　　　　　　　　　　　　  |
| [docs/nestia-guide.md](./docs/nestia-guide.md)　　　　　　　 | Nestia 사용 가이드　　　　　　　　　　　　　　　　　 |

## API Endpoints

| Method | Endpoint                                   | Description　　　　　　 | Auth         |
| ------ | ------------------------------------------ | ----------------------- | ------------ |
| POST   | `/api/auth/login`                          | 로그인　　　　　　　　  | -            |
| GET    | `/api/auth/quota`                          | 사용자 저장공간 할당량  | JWT          |
| POST   | `/api/tenants/:tenantId/files`             | PDF 업로드　　　　　　  | JWT + Tenant |
| GET    | `/api/tenants/:tenantId/files`             | 파일 목록　　　　　　　 | JWT + Tenant |
| GET    | `/api/files/:fileId/index-status`          | 인덱싱 상태　　　　　　 | JWT          |
| POST   | `/api/files/:fileId/chat`                  | AI 채팅 질문　　　　　  | JWT          |
| GET    | `/api/admin/tenants/:tenantId/users-usage` | 사용량 조회　　　　　　 | JWT + Admin  |

## checkpoints

- [x] Docker Compose 또는 Snap 중 하나를 선택하여 로컬 또는 자체 서버 환경에 구축한다. -> Docker compose (/infra)
- [x] 회사 tenant는 Nextcloud Group으로 매핑한다. 예: tenant-a, tenant-b
- [x] 각 회사에 사용자 3명 이상을 생성하고 해당 Group에 소속시킨다.
- [x] 사용자별 기본 quota를 100MB로 설정한다.
- [x] 최소 1명 이상의 사용자는 파일 업로드를 통해 50MB 이상 사용하도록 구성한다.
- [x] Nextcloud 관리자 계정, App Password, API Key 등은 환경변수로 관리한다.
- [x] Nextcloud OCS Provisioning API를 이용해 사용자별 used/quota를 조회한다.
- [ ] 특정 tenant에 속한 사용자들의 사용량 목록을 제공한다. -> 다른 사용자의 사용량 현황 ?
- [ ] 필수응답필드 tenantId, userId 또는 email, usedBytes, quotaBytes, usagePercent, lastCollectedAt -> lastCollectedAt 빠짐
- [ ] 관리자 화면 회사 선택 UI와 사용자별 사용량 테이블을 제공한다.
- [x] 사용률을 시각적으로 표시한다. 색상 기준은 지원자가 자유롭게 정의한다.
- [x] Nextcloud API 장애 또는 인증 실패 시 5xx 응답과 안전한 오류 메시지를 반환한다.
- [x] PDF 파일 업로드를 지원한다. PDF 총 용량은 200MB 이하 기준으로 테스트한다.
- [x] 업로드된 파일은 Nextcloud의 사용자 또는 tenant 전용 폴더에 저장한다.
- [x] Nextcloud에 저장된 폴더와 PDF 파일 목록을 화면에 표시한다.
- [x] PENDING, PROCESSING, COMPLETED, FAILED 등 인덱싱 상태를 표시한다.
- [x] PDF 파일을 선택하면 오른쪽 AI 채팅창이 활성화된다.
- [x] 단일 파일 기준 질문은 필수이며, 폴더 기준 질문은 선택 기능으로 구현할 수 있다.
- [x] PDF 업로드 완료 시 문서 처리 작업을 생성한다.
- [x] PDF 페이지별 텍스트를 추출한다. OCR은 선택 기능으로 둔다.
- [x] 페이지, 문단, 길이 기준으로 텍스트를 chunk 단위로 분해한다.
- [x] tenantId, documentId, fileName, pageNo, paragraphNo, bbox 정보를 저장한다.
- [x] chunk별 embedding을 생성한다.
- [x] embedding과 메타데이터를 Vector DB에 저장한다.
- [x] 파일 변경 또는 인덱싱 실패 시 재처리할 수 있는 구조를 고려한다.
- [x] 오른쪽 채팅창에서 사용자가 자연어 질문을 입력한다.
- [ ] tenantId와 documentId 또는 folderId 조건으로 문서를 검색한다.
- [x] 검색된 문서 chunk를 근거로 LLM이 답변을 생성한다.
- [x] 파일명, 페이지 번호, 문단 번호, 근거 텍스트 일부를 함께 제공한다.
- [x] 검색 결과가 부족하면 “문서에서 확인 불가”라고 답변한다.
- [x] 문서에 없는 내용을 일반 지식으로 보완하지 않는다.
- [ ] PDF 총 용량 200MB 이하 기준, 질의응답 처리 시간 10초 이내를 목표로 한다.

## 보안 및 권한 요구사항

- [x] Tenant 격리 모든 API 요청에서 사용자 tenantId를 검증하고, DB/Vector 검색 조건에 tenantId를 포함한다.
- [x] 파일 권한 Nextcloud WebDAV 접근 전 해당 파일이 사용자 또는 tenant에 허용된 파일인지 확인한다.
- [ ] Vector DB 격리 검색 시 tenantId 필터를 강제한다. 전체 Vector DB 검색을 금지한다.
- [x] 비밀정보 관리 Nextcloud App Password, LLM API Key, DB Password는 환경변수 또는 Secret Manager로 관리한다.
- [ ] 로그 관리 질문/답변 로그에는 민감정보가 포함될 수 있으므로 접근 권한과 보관 기간을 정의한다.
- [ ] 오류 처리 Nextcloud API 실패 시 민감정보를 제외한 오류 메시지를 반환한다.
- [x] 환각 억제 검색 근거가 없는 경우 일반 지식으로 답변하지 않고 “문서에서 확인 불가”를 반환한다.

## 필수 테스트 시나리오

- [x] tenant-a 사용자로 로그인 tenant-a에 허용된 파일만 표시된다.
- [x] tenant-b 파일 직접 접근 시도 403 Forbidden 또는 접근 불가 메시지를 반환한다.
- [x] PDF 파일 업로드 Nextcloud에 파일이 저장되고 documents에 PENDING 상태로 등록된다.
- [x] PDF 인덱싱 완료 indexStatus가 COMPLETED로 변경되고 chunkCount가 표시된다.
- [x] 파일 선택 오른쪽 AI 채팅창이 표시된다.
- [x] 문서 내용 질문 답변과 파일명/페이지/문단/근거 텍스트가 표시된다.
- [x] 문서에 없는 질문 “문서에서 확인 불가”라고 표시된다.
- [x] 50MB 이상 파일 업로드 used/quota 사용률이 50% 이상으로 표시된다.
- [x] Nextcloud API 인증 실패 Backend가 5xx 오류와 안전한 메시지를 반환한다.
- [ ] Vector DB 장애 채팅 응답 실패 메시지를 표시하고 시스템 로그에 원인을 기록한다.
