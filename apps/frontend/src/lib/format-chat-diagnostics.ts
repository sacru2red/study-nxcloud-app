export function formatDiagnosticsMessage(reason: string | undefined): string | undefined {
  if (!reason) {
    return undefined
  }
  const labels: Record<string, string> = {
    NO_RELEVANT_CHUNKS: '관련 문서 구간을 찾지 못했습니다.',
    EMBEDDING_FAILED: '질문 임베딩에 실패했습니다.',
    LLM_API_FAILED: 'LLM API 호출에 실패했습니다.',
    REQUEST_FAILED: '요청 처리에 실패했습니다.',
  }
  return labels[reason] ?? reason
}
