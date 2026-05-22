import type { IndexProgressData } from '../components/index-progress-display'

const phaseToLegacyStatus: Record<IndexProgressData['phase'], string> = {
  queued: 'PENDING',
  extracting: 'PROCESSING',
  chunking: 'PROCESSING',
  embedding: 'PROCESSING',
  completed: 'COMPLETED',
  failed: 'FAILED',
}

export function legacyStatusFromProgress(
  progress: IndexProgressData | undefined,
  fallback: string,
): string {
  if (!progress) {
    return fallback
  }
  return phaseToLegacyStatus[progress.phase] ?? fallback
}
