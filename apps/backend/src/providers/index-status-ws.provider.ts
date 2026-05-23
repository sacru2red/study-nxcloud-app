import type { Driver } from 'tgrid'
import type { FilesDto } from '../presentation/files.dto'
import { FilesProvider } from './files.provider'

const POLL_MS = 2000
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED'])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class IndexStatusWsProvider implements FilesDto.IIndexStatusWsProvider {
  private closed = false

  constructor(
    private readonly fileId: string,
    private readonly tenantId: string,
    private readonly listener: Driver<FilesDto.IIndexStatusWsListener>,
  ) {}

  public async run(): Promise<void> {
    while (!this.closed) {
      const snapshot = await FilesProvider.getIndexStatus(this.fileId, this.tenantId)
      await this.listener.onStatus(snapshot)
      if (TERMINAL_STATUSES.has(snapshot.status)) {
        break
      }
      await sleep(POLL_MS)
    }
  }

  public stop(): void {
    this.closed = true
  }
}
