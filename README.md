# Document AI Chat - Nextcloud 기반 문서 AI 채팅 시스템

Nextcloud를 파일 저장소로 활용한 멀티테넌트 문서 AI 채팅 시스템. PDF 업로드 → 자동 인덱싱 → RAG 기반 질의응답.

## 목차

- [Quick Start](#quick-start)
- [Demo](#demo)
- [Monorepo 구조](#monorepo-구조)
- [구현 특이사항](#구현-특이사항)
- [아키텍처](#아키텍처)
- [문서](#문서)
- [API Endpoints](#api-endpoints)
- [요구사항 충족 현황](#요구사항-충족-현황)
- [(예상) 검수 Q&A](#예상-검수-qa)

## Quick Start

```bash
docker compose -f infra/docker-compose.yml up -d
chmod +x infra/init-nextcloud.sh
./infra/init-nextcloud.sh   # 그룹·사용자·quota·50MB 샘플 업로드
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

| 경로                          | 설명                                 |
| ----------------------------- | ------------------------------------ |
| `apps/backend`                | NestJS API, RAG, 인덱싱              |
| `apps/frontend`               | React + Vite UI                      |
| `apps/backend-e2e`            | API Jest E2E                         |
| `apps/frontend-e2e`           | Playwright (`capture-demo`)          |
| `infra/`                      | Docker Compose (Postgres, Nextcloud) |
| `prisma/`                     | 스키마·seed                          |
| `tools/concat-demo-videos.js` | 데모 WebM 합본 + MP4 변환            |

## 구현 특이사항

### API 계약: Nestia + typia

요청·응답 스키마는 **순수 TypeScript `interface`만** 정의하면 됩니다. `class`·`class-validator`·필드별 Swagger 데코레이터 없이, typia tags로 제약만 붙입니다.

```typescript
// apps/backend/src/presentation/auth.dto.ts (발췌)
export namespace AuthDto {
  export interface LoginRequest {
    email: string & tags.Format<'email'>
    password: string & tags.MinLength<1>
  }
}
```

- 컨트롤러는 `@TypedRoute` / `@TypedBody` / `@TypedParam` 등으로 위 타입을 연결합니다.
- Nestia + typia가 **네트워크 입·출력을 런타임 검증**하고, 형식 오류는 일관된 HTTP 4xx로 반환합니다. (`@TypedException`으로 문서화 가능 — [nestia-guide.md](./docs/nestia-guide.md))
- 같은 타입 정의에서 `NestiaSwaggerComposer`가 **OpenAPI(Swagger)를 자동 생성**합니다. (`http://localhost:3000/swagger-doc`, non-production)
- `npx nx run backend:sdk` → `apps/backend/src/api`에 **타입 안전 fetch SDK** 생성. 프론트는 `backend-sdk` alias로 `api.functional.*` 호출 ([`apps/frontend/src/queries/index.ts`](apps/frontend/src/queries/index.ts)). SDK 디렉터리는 `.gitignore` 대상이므로 clone 후 한 번 생성해야 합니다.

### E2E·데모 자동화

| 레이어 | 도구                              | 범위                                                                                                 |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| API    | Jest + axios (`apps/backend-e2e`) | 로그인, tenant 격리, 업로드·인덱싱·RAG·bbox·diagnostics·환각 억제, Admin(50MB)·quota, NC sanitize 등 |
| UI     | Playwright (`apps/frontend-e2e`)  | 인증·Admin 라우팅 가드, **데모 스크린샷/영상** (`demo-capture` 프로젝트)                             |

- API E2E는 **코드로 생성한 최소 PDF**를 사용해 외부 샘플 파일 없이 RAG 파이프라인을 검증합니다.
- Playwright `webServer`가 backend 빌드 산출물 + Vite dev 서버를 기동하고, `capture-demo`는 `docs/screenshots/`·`docs/demo-capture.webm`을 갱신합니다. 합본 MP4는 [`tools/concat-demo-videos.js`](tools/concat-demo-videos.js).

### RAG·멀티테넌트

- **pgvector** + Prisma raw SQL, 모든 검색·저장에 `tenant_id` 필터.
- 채팅 응답 optional **`diagnostics`** (`NO_RELEVANT_CHUNKS`, `EMBEDDING_FAILED`, `LLM_API_FAILED`) — UI에서 사용자 메시지로 표시.
- RAG **`sources[].bbox`** (pdf.js 추출) — 근거 카드 클릭 시 PDF 뷰어 페이지 이동 + bbox 하이라이트.
- **EmbeddingProvider**: 청크 단위 embedding, 429 재시도·스로틀, OpenRouter 폴백.
- **JwtAuthGuard** / **TenantGuard** / **AdminRoleGuard**로 API·Admin tenant 간 조회 분리.
- Nextcloud/WebDAV·OCS 오류는 stack·자격증명 없이 **고정 HttpException 메시지**로 sanitize.

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

| Category     | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Monorepo     | Nx 22.7                                                          |
| Backend      | NestJS 11 + Nestia 11                                            |
| Frontend     | React 19 + Vite 8 + TailwindCSS 3                                |
| Database     | PostgreSQL 16 + pgvector                                         |
| File Storage | Nextcloud (WebDAV + OCS API)                                     |
| Embedding    | Gemini gemini-embedding-001 (768d); optional OpenRouter fallback |
| LLM          | opencode zen / OpenRouter (`LLM_MODEL`, `LLM_BASE_URL`)          |
| Auth         | JWT (bcrypt + @nestjs/jwt)                                       |
| State        | jotai + @tanstack/react-query                                    |
| Router       | @tanstack/react-router                                           |
| SDK          | typia + @nestia/core                                             |

## 문서

| 문서                                                               | 설명                                 |
| ------------------------------------------------------------------ | ------------------------------------ |
| [docs/development.md](./docs/development.md)                       | 로컬 환경, E2E, 데모 캡처, 벤치마크  |
| [docs/deploy-oracle-cloud.md](./docs/deploy-oracle-cloud.md)       | Oracle Cloud 배포                    |
| [docs/api-examples.md](./docs/api-examples.md)                     | API 응답 예시                        |
| [docs/logging-policy.md](./docs/logging-policy.md)                 | 로그·채팅 보관 정책                  |
| [docs/quota-scalability.md](./docs/quota-scalability.md)           | 쿼터 조회 확장성 설계 (10만+ 사용자) |
| [docs/requirements-checklist.md](./docs/requirements-checklist.md) | 기능·요구사항 충족 체크리스트        |
| [docs/nestia-guide.md](./docs/nestia-guide.md)                     | Nestia 가이드                        |

## API Endpoints

| Method | Endpoint                                   | Description                        | Auth         |
| ------ | ------------------------------------------ | ---------------------------------- | ------------ |
| POST   | `/api/auth/login`                          | 로그인                             | -            |
| GET    | `/api/auth/quota`                          | 저장공간 할당량                    | JWT          |
| POST   | `/api/tenants/:tenantId/files`             | PDF 업로드 (`folderId` 선택)       | JWT + Tenant |
| GET    | `/api/tenants/:tenantId/files`             | 파일 목록                          | JWT + Tenant |
| GET    | `/api/files/:fileId/index-status`          | 인덱싱 상태                        | JWT          |
| POST   | `/api/files/:fileId/retry`                 | 인덱싱 재시도                      | JWT          |
| GET    | `/api/files/:fileId/content`               | PDF 스트림 (뷰어)                  | JWT          |
| POST   | `/api/files/:fileId/chat`                  | 문서 RAG (`diagnostics` 선택)      | JWT          |
| POST   | `/api/folders/:folderId/chat`              | 폴더 RAG                           | JWT          |
| GET    | `/api/admin/tenants`                       | tenant 목록                        | JWT + Admin  |
| GET    | `/api/admin/tenants/:tenantId/users-usage` | 사용자별 usage + `lastCollectedAt` | JWT + Admin  |

Swagger: http://localhost:3000/swagger-doc

## 요구사항 충족 현황

요구사항 체크리스트 전체는 [docs/requirements-checklist.md](./docs/requirements-checklist.md)에서 관리합니다.

- **완료**: 멀티테넌트·Nextcloud·RAG·Admin usage·폴더 RAG·PDF bbox(추출·API·뷰어 하이라이트)·E2E 시나리오
- **목표(측정)**: Q&A 10초 이내 — [벤치마크 절차](./docs/development.md#rag-응답-시간-벤치마크) (자동 SLA 검증 없음)

## Q&A

제출물을 **로컬 실행 없이** 훑어보거나, 짧은 시간 안에 핵심만 확인할 때를 가정한 질문입니다. 상세 실행·API 키 설정은 [development.md](./docs/development.md)를 참고하세요.

### 제출물·증빙 위치

**Q. 요구 기능을 한눈에 보려면 어디를 보면 되나요?**  
A. [Demo](#demo) 스크린샷·[MP4](./docs/demo-capture.mp4) → 항목별 [requirements-checklist.md](./docs/requirements-checklist.md) → API 계약은 [Swagger](http://localhost:3000/swagger-doc)(로컬 실행 시) 또는 [api-examples.md](./docs/api-examples.md) 순서를 권장합니다.

**Q. 실제 동작하고 있나요? 가짜 데모 영상·캡처 아닌가요?**  
A. Playwright `demo-capture`로 같은 시나리오(로그인 → PDF 업로드 → 인덱싱 완료 → RAG 질문·근거 → 환각 억제 → Admin)를 자동 촬영한 결과입니다. 재현 절차는 [development.md — 데모 캡처](./docs/development.md#데모-캡처-스크린샷-자동-생성)에 있습니다.

**Q. 자동 테스트로 무엇을 검증했나요?**  
A. `apps/backend-e2e`: tenant 격리, 업로드·인덱싱·채팅·bbox·diagnostics·「문서에서 확인 불가」·Admin usage(50MB 샘플)·quota·Nextcloud 오류 sanitize 등. `apps/frontend-e2e`: 로그인·Admin 접근 제어·데모 캡처. 체크리스트 하단에 최근 통과 기록이 있습니다.

### 멀티테넌트·Nextcloud

**Q. tenant 격리는 어디서 확인할 수 있나요?**  
A. E2E Test 2(tenant-b 파일 403), RAG·DB·pgvector 쿼리의 `tenant_id` 필터([구현 특이사항](#rag멀티테넌트)), 체크리스트 「보안」 항목. 스크린샷만으로는 tenant-b 시나리오가 없으므로 E2E·코드·체크리스트를 함께 보시면 됩니다.

**Q. Nextcloud 연동·quota는 구현됐나요?**  
A. 파일 저장 WebDAV, 사용량 OCS API, Admin 화면(스크린샷 7)·`GET /api/admin/tenants/:tenantId/users-usage`(`lastCollectedAt` 포함). `infra/init-nextcloud.sh`가 user-a1에 ~52MB 샘플 파일을 올려 Admin 사용률 데모·E2E에 사용합니다.

**Q. Nextcloud 장애 시 사용자에게 민감 정보가 노출되나요?**  
A. 의도적으로 제한합니다. API는 고정 메시지의 5xx만 반환하고, 정책은 [logging-policy.md](./docs/logging-policy.md)에 정리했습니다.

### RAG·채팅·Admin

**Q. RAG 근거 표시와 환각 억제는 데모에서 어떻게 보이나요?**  
A. 스크린샷 5-1·5-2: 질문 답변 + source 카드(파일명·페이지·문단). 스크린샷 5-1-1: source 클릭 시 PDF 페이지 이동·bbox 하이라이트. 스크린샷 6: 문서 밖 질문 → 「문서에서 확인 불가」·sources 빈 배열·`diagnostics.reason`. 백엔드 E2E가 동일 동작을 assert합니다.

**Q. 폴더 단위 RAG는 어디에 있나요?**  
A. API `POST /api/folders/:folderId/chat`, 업로드 시 optional `folderId`. UI는 메인 화면 **폴더 채팅** 탭. 체크리스트 「폴더 RAG」 참고. 데모 영상은 단일 PDF 중심이라 폴더 탭은 스크린샷보다 API·체크리스트 확인이 빠릅니다.

**Q. Admin이 다른 tenant 사용량을 볼 수 있나요?**  
A. `role === 'admin'`만 `/api/admin/*` 접근. 화면에서 tenant `<select>`로 tenant-a/b 전환·사용률 표(스크린샷 7). 일반 user는 Admin URL 진입 시 메인으로 돌아갑니다(frontend-e2e `admin.spec.ts`).

### 미구현·한계 (명시)

**Q. 체크리스트에 [ ]로 남은 항목은?**  
A. **Q&A 10초**만 미체크(측정 목표). bbox는 pdf.js 추출 → `bboxJson` 저장 → API `sources[].bbox` → PDF 뷰어 하이라이트까지 구현했습니다. 기존에 인덱싱된 문서는 **재업로드 또는 retry** 후 bbox가 채워집니다.

**Q. API 키·비밀번호가 저장소에 포함되나요?**  
A. `.env.template`만 제공하고 실제 키는 커밋하지 않습니다. 데모·E2E 재현 시 검수자 본인 키가 필요합니다.

### 짧은 로컬 검수(선택)

**Q. 10~15분 안에 직접 눌러보려면?**  
A. [Quick Start](#quick-start) → `user-a1@example.com` / `password123` 로그인 → README와 동일 PDF 업로드 → 인덱싱 `COMPLETED` 후 「하이브리드 자동차가 무엇인가요?」 질문. Admin은 `/admin` 또는 UI 링크.
