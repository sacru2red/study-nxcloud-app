# 요구사항 충족 체크리스트

README에서 분리한 충족 현황입니다.

**최종 검증 (로컬):** `npx nx run backend-e2e:e2e` · `npx nx e2e frontend-e2e` (2026-05-24, `prepare-e2e` + `init-nextcloud.sh` 포함)

## 인프라·Nextcloud

- [x] Docker Compose 로컬 구축 (`infra/`)
- [x] tenant ↔ Nextcloud Group (tenant-a, tenant-b)
- [x] 사용자 3명 이상 / Group 소속
- [x] 사용자별 quota 100MB
- [x] 50MB 이상 사용 샘플 구성 (`infra/init-nextcloud.sh` → user-a1 `quota-sample.bin` ~52MB)
- [x] 비밀정보 환경변수 관리
- [x] OCS API used/quota 조회
- [x] Nextcloud 장애 시 5xx + 안전 메시지 (`nextcloud-error.util.ts` + E2E sanitize assert)

## Admin·사용량

- [x] tenant 소속 사용자 사용량 목록 API
- [x] 필수 필드: tenantId, userId, email, usedBytes, quotaBytes, usagePercent, lastCollectedAt
- [x] 관리자 화면 tenant 선택 + 사용자 테이블
- [x] 사용률 시각화(ProgressBar)

## 문서·인덱싱·채팅

- [x] PDF 업로드·목록·인덱싱 상태
- [x] 파일 선택 시 채팅 활성화
- [x] 단일 파일 RAG + 폴더 RAG(선택, UI 탭)
- [x] chunk·embedding·pgvector 저장
- [x] 인덱싱 재시도 (`POST /api/files/:fileId/retry`)
- [x] documentId / folderId 조건 검색
- [x] 근거(파일명·페이지·문단·텍스트) + 환각 억제
- [x] bbox 저장·API·PDF 뷰어 하이라이트 (pdf.js → `bbox_json` → `sources[].bbox`)
- [ ] Q&A 10초 이내 (측정 목표; [벤치마크](./development.md#rag-응답-시간-벤치마크) — 자동 SLA 검증 없음)

## 보안

- [x] Tenant 격리 (API + DB + Vector `tenant_id`)
- [x] Vector 검색 tenant 필터 강제
- [x] 비밀정보 환경변수
- [x] 로그 정책 문서화 ([logging-policy.md](./logging-policy.md))
- [x] Nextcloud 오류 메시지 sanitize

## E2E 시나리오

- [x] tenant-a/b 격리
- [x] 업로드·인덱싱·채팅·bbox·환각 억제·quota·Admin 50MB 샘플·폴더 RAG·retry·index-status WS
- [x] Nextcloud 인증 실패 → 503 고정 메시지 (sanitize integration test)
- [x] 채팅 diagnostics (`NO_RELEVANT_CHUNKS` assert) / API 실패 UI 메시지
