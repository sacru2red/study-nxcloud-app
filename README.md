# Document AI Chat - Nextcloud 기반 문서 AI 채팅 시스템

Nextcloud를 파일 저장소로 활용한 멀티테넌트 문서 AI 채팅 시스템. PDF 업로드 → 자동 인덱싱 → RAG 기반 질의응답.

## 시스템 구성

```
사용자 → React Frontend (5173) → NestJS Backend (3000) → PostgreSQL/pgvector
                                                      → Nextcloud (8081)
                                                      → Gemini Embedding API
                                                      → opencode zen LLM
```

## 사전 요구사항

- Node.js >= 20
- Docker Desktop (Nextcloud + PostgreSQL)
- API 키: Gemini Embedding (`gemini-embedding-001`) + opencode zen (또는 OpenRouter)

## 빠른 시작

### 1. 인프라 실행

```bash
# PostgreSQL(pgvector) + Nextcloud 실행
docker compose -f infra/docker-compose.yml up -d

# Nextcloud 초기화 (그룹/사용자/쿼터 설정)
chmod +x infra/init-nextcloud.sh
./infra/init-nextcloud.sh
```

### 2. 환경 변수 설정

```bash
cp .env.template .env
```

`.env` 파일을 열고 다음 값들을 설정하세요:

- `GEMINI_API_KEY`: Google AI Studio에서 발급
- `OPENCODE_API_KEY`: opencode.ai에서 발급
- `JWT_SECRET`: 임의의 문자열로 변경

### 3. 데이터베이스 초기화

```bash
# Prisma 마이그레이션
npx prisma generate --schema=prisma/schema.prisma
npx prisma db push --schema=prisma/schema.prisma

# 시드 데이터 (2개 Tenant + 6명 사용자)
npx tsx prisma/seed.ts
```

### 4. 개발 서버 실행

```bash
# Nx dev 서버 (backend + frontend 동시 실행)
npx nx run-many -t serve -p backend frontend
```

- Backend: http://localhost:3000/api
- Frontend: http://localhost:5173
- Swagger: http://localhost:3000/swagger-doc
- Nextcloud: http://localhost:8081 (admin / admin123)

## 테스트 계정

| Tenant   | Role  | Email            | Password    |
| -------- | ----- | ---------------- | ----------- |
| Tenant A | Admin | user-a1@datco.kr | password123 |
| Tenant A | User  | user-a2@datco.kr | password123 |
| Tenant A | User  | user-a3@datco.kr | password123 |
| Tenant B | Admin | user-b1@datco.kr | password123 |
| Tenant B | User  | user-b2@datco.kr | password123 |
| Tenant B | User  | user-b3@datco.kr | password123 |

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

## E2E 테스트 실행

### Backend API (Jest)

```bash
npx nx run backend:prepare-e2e
npx nx e2e backend-e2e
```

### Frontend (Playwright)

```bash
npx nx run backend:prepare-e2e
npx nx e2e frontend-e2e
```

Playwright가 `backend:build` 후 `node dist/apps/backend/main.js`(3000)와 `npx vite`(4200, `/api` 프록시)를 자동으로 띄웁니다. 로컬에서 이미 서버가 떠 있으면 재사용합니다(`CI`가 설정되면 매번 새로 기동).

`prepare-e2e`는 Docker(Postgres + Nextcloud), DB push, seed를 실행합니다. `.env`에 API 키가 설정되어 있어야 합니다.

## 테스트 시나리오

```bash
# 1. 로그인
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user-a1@datco.kr","password":"password123"}'

# TOKEN 저장
TOKEN="<위 응답의 accessToken>"

# 2. 파일 업로드
curl -X POST http://localhost:3000/api/tenants/tenant-a/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf"

# 3. 파일 목록
curl http://localhost:3000/api/tenants/tenant-a/files \
  -H "Authorization: Bearer $TOKEN"

# 4. 인덱싱 상태 확인
curl http://localhost:3000/api/files/{fileId}/index-status \
  -H "Authorization: Bearer $TOKEN"

# 5. AI 채팅
curl -X POST http://localhost:3000/api/files/{fileId}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"이 문서의 주요 내용은?"}'

# 6. 관리자 사용량
curl http://localhost:3000/api/admin/tenants/tenant-a/users-usage \
  -H "Authorization: Bearer $TOKEN"

# 7. 테넌트 격리 테스트 (tenant-b 파일에 tenant-a 토큰으로 접근 → 403)
curl http://localhost:3000/api/tenants/tenant-b/files \
  -H "Authorization: Bearer $TOKEN"
```
