export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getRemainingBytes(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.max(0, quotaBytes - usedBytes)
}

export function isQuotaExceeded(usedBytes: number, quotaBytes: number): boolean {
  return quotaBytes > 0 && usedBytes >= quotaBytes
}

export function wouldExceedQuota(usedBytes: number, quotaBytes: number, fileSize: number): boolean {
  return quotaBytes > 0 && usedBytes + fileSize > quotaBytes
}

export function isQuotaWarning(
  usedBytes: number,
  quotaBytes: number,
  thresholdPercent = 80,
): boolean {
  if (quotaBytes <= 0 || isQuotaExceeded(usedBytes, quotaBytes)) {
    return false
  }
  return (usedBytes / quotaBytes) * 100 >= thresholdPercent
}

export function getUploadQuotaMessage(
  usedBytes: number,
  quotaBytes: number,
  fileSize: number,
): string | null {
  if (quotaBytes <= 0) {
    return null
  }

  if (isQuotaExceeded(usedBytes, quotaBytes)) {
    return `저장공간 할당량(${formatBytes(quotaBytes)})을 모두 사용했습니다. 파일을 삭제하거나 관리자에게 문의하세요.`
  }

  if (wouldExceedQuota(usedBytes, quotaBytes, fileSize)) {
    const remainingBytes = getRemainingBytes(usedBytes, quotaBytes)
    return `파일 크기(${formatBytes(fileSize)})가 남은 용량(${formatBytes(remainingBytes)})을 초과합니다.`
  }

  return null
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0]
    }
  }
  return fallback
}
