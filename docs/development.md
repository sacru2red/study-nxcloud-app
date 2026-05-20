# 개발 가이드

로컬 환경 설정, 개발 서버 실행, E2E 테스트 방법을 정리합니다.

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
npx prisma db push --schema=prisma/schema.prisma --config=prisma/prisma.config.ts

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

| Tenant   | Role  | Email               | Password    |
| -------- | ----- | ------------------- | ----------- |
| Tenant A | Admin | user-a1@example.com | password123 |
| Tenant A | User  | user-a2@example.com | password123 |
| Tenant A | User  | user-a3@example.com | password123 |
| Tenant B | Admin | user-b1@example.com | password123 |
| Tenant B | User  | user-b2@example.com | password123 |
| Tenant B | User  | user-b3@example.com | password123 |

## E2E 테스트 실행

### Backend API (Jest)

```bash
npx nx run backend:prepare-e2e
npx nx e2e backend-e2e
```

완전 초기화가 필요하면 아래 명령을 사용하세요.

```bash
npx nx run backend:prepare-e2e:reset
```

### Frontend (Playwright)

```bash
npx nx run backend:prepare-e2e
npx nx e2e frontend-e2e
```

Playwright가 `backend:build` 후 `node dist/apps/backend/main.js`(3000)와 `npx vite`(4200, `/api` 프록시)를 자동으로 띄웁니다. 로컬에서 이미 서버가 떠 있으면 재사용합니다(`CI`가 설정되면 매번 새로 기동).

`prepare-e2e`는 Docker(Postgres + Nextcloud), DB push, seed를 실행합니다. `.env`에 API 키가 설정되어 있어야 합니다.

`prepare-e2e:reset`은 `docker compose down -v`를 먼저 실행해 Postgres/Nextcloud 볼륨을 삭제한 뒤 다시 기동합니다. 따라서 DB 데이터와 업로드 파일(Nextcloud 저장 파일)도 함께 초기화됩니다.

### 데모 캡처 (스크린샷 자동 생성)

`.tmp/demo-pdfs/`에 PDF를 배치한 후 아래 명령으로 `docs/screenshots/`에 스크린샷 01~06(선택 08)을 생성합니다. 자세한 내용은 [submission-tasks.md §3.2](./submission-tasks.md)를 참고하세요.

```bash
npx nx run frontend-e2e:capture-demo
```

## 수동 API 테스트 시나리오

```bash
# 1. 로그인
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user-a1@example.com","password":"password123"}'

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

응답 예시는 [api-examples.md](./api-examples.md)를 참고하세요.

## 프로덕션 배포 (Oracle Cloud)

모놀리식 Docker Compose 배포는 [deploy-oracle-cloud.md](./deploy-oracle-cloud.md)를 참고하세요.

## 관련 문서

- [README.md](../README.md#아키텍처) — 시스템 아키텍처
- [api-examples.md](./api-examples.md) — API 응답 예시
- [nestia-guide.md](./nestia-guide.md) — Nestia 사용 가이드
- [submission-tasks.md](./submission-tasks.md) — 제출 준비 및 데모 캡처 자동화
