const HANGUL_RE = /[\uAC00-\uD7A3]/

function hasHangul(value: string): boolean {
  return HANGUL_RE.test(value)
}

/**
 * Multer/busboy가 multipart filename 바이트를 latin1로 읽어 한글이 깨질 때가 많습니다.
 * UTF-8로 올바르게 디코딩된 문자열을 반환합니다.
 */
export function normalizeUploadFileName(name: string): string {
  if (!name) {
    return name
  }

  if (hasHangul(name)) {
    return name
  }

  const utf8FromLatin1 = Buffer.from(name, 'latin1').toString('utf8')

  if (hasHangul(utf8FromLatin1)) {
    return utf8FromLatin1
  }

  const looksLikeMojibake =
    /[\u0080-\u00FF]/.test(name) && utf8FromLatin1 !== name && !/[\uFFFD]/.test(utf8FromLatin1)

  if (looksLikeMojibake) {
    return utf8FromLatin1
  }

  return name
}
