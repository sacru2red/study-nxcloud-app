# Document AI Chat - Nextcloud 기반 문서 AI 채팅 시스템

Nextcloud를 파일 저장소로 활용한 멀티테넌트 문서 AI 채팅 시스템. PDF 업로드 → 자동 인덱싱 → RAG 기반 질의응답.

## 목차

- [Quick Start](#quick-start)
- [Demo](#demo)
- [Monorepo 구조](#monorepo-구조)
- [아키텍처](#아키텍처)
- [문서](#문서)
- [API Endpoints](#api-endpoints)
- [요구사항 충족 현황](#요구사항-충족-현황)

## Quick Start

```bash
docker compose -f infra/docker-compose.yml up -d
cp .env.template .env   # GEMINI_API_KEY, LLM_API_KEY 등 설정
npx prisma db push --schema=prisma/schema.prisma --config=prisma/prisma.config.ts
npx tsx prisma/seed.ts
npx nx run-many -t serve -p backend frontend
```

- Frontend: http://localhost:4200 (API 프록시 → backend `:3000`)
- Swagger: http://localhost:3000/swagger-doc
- 로그인: `user-a1@example.com` / `password123` ([테스트 계정](./docs/development.md#테스트-계정))

상세 설정·E2E·데모 캡처는 [docs/development.md](./docs/development.md)를 참고하세요.

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

GitHub README는 동영상 인라인 재생을 지원하지 않습니다. 아래 썸네일을 클릭하면 저장소의 MP4를 열 수 있습니다.

[![Demo video — click to play](docs/screenshots/04-main-layout.png)](docs/demo-capture.mp4)

[MP4](./docs/demo-capture.mp4) · [WebM](./docs/demo-capture.webm)

스크린샷·동영상 재생성: [docs/development.md — 데모 캡처](./docs/development.md#데모-캡처-스크린샷-자동-생성)

## Monorepo 구조

| 경로 | 설명 |
| ---- | ---- |
| `apps/backend` | NestJS API, RAG, 인덱싱 |
| `apps/frontend` | React + Vite UI |
| `apps/backend-e2e` | API Jest E2E |
| `apps/frontend-e2e` | Playwright (`capture-demo`) |
| `infra/` | Docker Compose (Postgres, Nextcloud) |
| `prisma/` | 스키마·seed |
| `tools/concat-demo-videos.js` | 데모 WebM 합본 + MP4 변환 |

## 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │  Sidebar  │  │  PdfViewer   │  │  ChatPanel / FolderChat      │  │
│  │  파일목록 │  │  react-pdf   │  │  SourceCard(근거)            │  │
│  │  업로드   │  │  페이지이동  │  │  diagnostics 표시          │  │
│  └────┬──────┘  └──────┬───────┘  └──────────────────────────────┘  │
│       └────────────────┼──────────────────────────────────────────┘  │
└────────────────────────┼─────────────────────────────────────────────┘
                         │ HTTP /api (Vite :4200 → proxy :3000)
┌────────────────────────┼─────────────────────────────────────────────┐
│              Backend (NestJS + Nestia)                                │
│  Auth / Files / Admin / Chat / Folder controllers                     │
│  Providers: Nextcloud, PdfWorker, EmbeddingProvider, LlmProvider      │
└────────────────────────┼─────────────────────────────────────────────┘
         │                     │
         ▼                     ▼
   PostgreSQL + pgvector    Nextcloud (WebDAV + OCS)
```

### RAG 파이프라인 (요약)

1. `EmbeddingProvider.generateEmbedding(question)` — Gemini `gemini-embedding-001` (768d), 429 시 재시도·OpenRouter 폴백
2. pgvector 검색 — `WHERE tenant_id` + `document_id` (또는 `folder_id`), similarity ≥ 0.3
3. `LlmProvider.chat` — `.env`의 `LLM_MODEL` / `LLM_BASE_URL`
4. 응답 — `answer`, `sources[]`, optional `diagnostics` (`NO_RELEVANT_CHUNKS`, `EMBEDDING_FAILED`, `LLM_API_FAILED`)

### PDF 인덱싱 (요약)

업로드 → Nextcloud WebDAV → `pdf-parse` → chunk(500/100 overlap) → 청크별 embedding → `COMPLETED`

### 보안 / 권한

- **JwtAuthGuard** + **TenantGuard** (일반 tenant API)
- **AdminRoleGuard** (admin 전용 `/api/admin/*`, tenant 간 usage 조회)
- Vector·DB 쿼리에 `tenant_id` 필터

### 기술 스택

| Category     | Technology |
| ------------ | ---------- |
| Monorepo     | Nx 22.7 |
| Backend      | NestJS 11 + Nestia 11 |
| Frontend     | React 19 + Vite 8 + TailwindCSS 3 |
| Database     | PostgreSQL 16 + pgvector |
| File Storage | Nextcloud (WebDAV + OCS API) |
| Embedding    | Gemini gemini-embedding-001 (768d); optional OpenRouter fallback |
| LLM          | opencode zen / OpenRouter (`LLM_MODEL`, `LLM_BASE_URL`) |
| Auth         | JWT (bcrypt + @nestjs/jwt) |
| State        | jotai + @tanstack/react-query |
| Router       | @tanstack/react-router |
| SDK          | typia + @nestia/core |

## 문서

| 문서 | 설명 |
| ---- | ---- |
| [docs/development.md](./docs/development.md) | 로컬 환경, E2E, 데모 캡처, 벤치마크 |
| [docs/deploy-oracle-cloud.md](./docs/deploy-oracle-cloud.md) | Oracle Cloud 배포 |
| [docs/api-examples.md](./docs/api-examples.md) | API 응답 예시 |
| [docs/logging-policy.md](./docs/logging-policy.md) | 로그·채팅 보관 정책 |
| [docs/requirements-checklist.md](./docs/requirements-checklist.md) | 과제 요구사항 체크리스트 |
| [docs/nestia-guide.md](./docs/nestia-guide.md) | Nestia 가이드 |

## API Endpoints

| Method | Endpoint | Description | Auth |
| ------ | -------- | ----------- | ---- |
| POST | `/api/auth/login` | 로그인 | - |
| GET | `/api/auth/quota` | 저장공간 할당량 | JWT |
| POST | `/api/tenants/:tenantId/files` | PDF 업로드 (`folderId` 선택) | JWT + Tenant |
| GET | `/api/tenants/:tenantId/files` | 파일 목록 | JWT + Tenant |
| GET | `/api/files/:fileId/index-status` | 인덱싱 상태 | JWT |
| POST | `/api/files/:fileId/retry` | 인덱싱 재시도 | JWT |
| GET | `/api/files/:fileId/content` | PDF 스트림 (뷰어) | JWT |
| POST | `/api/files/:fileId/chat` | 문서 RAG (`diagnostics` 선택) | JWT |
| POST | `/api/folders/:folderId/chat` | 폴더 RAG | JWT |
| GET | `/api/admin/tenants` | tenant 목록 | JWT + Admin |
| GET | `/api/admin/tenants/:tenantId/users-usage` | 사용자별 usage + `lastCollectedAt` | JWT + Admin |

Swagger: http://localhost:3000/swagger-doc

## 요구사항 충족 현황

과제 체크리스트 전체는 [docs/requirements-checklist.md](./docs/requirements-checklist.md)에서 관리합니다.

- **완료**: 멀티테넌트·Nextcloud·RAG·Admin usage·폴더 RAG·E2E 시나리오 대부분
- **미구현(선택)**: PDF bbox 좌표 추출
- **목표(측정)**: Q&A 10초 이내 — [벤치마크 절차](./docs/development.md#rag-응답-시간-벤치마크)
