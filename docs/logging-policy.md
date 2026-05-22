# 로그 및 채팅 데이터 보관 정책

## 목적

질문·답변·임베딩 오류 로그에 민감정보가 섞일 수 있으므로, 접근 권한과 보관 범위를 명시합니다.

## 로그에 포함하지 않는 항목

- JWT, API Key, Nextcloud 관리자 비밀번호
- 사용자 비밀번호 평문
- 전체 PDF 원문 또는 긴 chunk 전체 텍스트

## 로그에 포함 가능한 항목

- `tenantId`, `documentId`, `userId`(UUID)
- 인덱싱 상태 전환, HTTP 상태 코드
- RAG diagnostics reason (`NO_RELEVANT_CHUNKS`, `EMBEDDING_FAILED`, `LLM_API_FAILED`)
- Nextcloud/WebDAV 오류의 **상태 코드·요약 메시지** (스택·자격증명 제외)

## 채팅 메시지(DB)

- `chat_messages` 테이블에 사용자 질문·어시스턴트 답변 저장
- 접근: 해당 tenant JWT + 애플리케이션 DB 권한
- 운영 환경에서는 DB 백업 보관 기간을 팀 정책에 맞게 설정

## 접근 권한

| 역할 | DB/로그 |
| ---- | ------- |
| 일반 user | 본인 tenant 세션만 (앱 UI 경유) |
| admin | Admin API·대시보드, tenant별 usage |
| 운영자 | 서버 로그, Postgres 백업 (별도 IAM) |

## 보관 기간 (권장)

- 애플리케이션 서버 로그: 30일
- `chat_messages`: 서비스 정책에 따라 90일 후 아카이브 또는 삭제
- E2E/데모 `test-results/`: 저장소에 커밋하지 않음

## 클라이언트 표시

- API 실패 시 일반화된 메시지 (`질문 처리 중 오류가 발생했습니다`)
- RAG diagnostics는 **reason 코드**만 UI에 표시 (API Key·스택 미노출)
