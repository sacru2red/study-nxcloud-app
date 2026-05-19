import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceRoot } from '@nx/devkit'

interface DemoPdf {
  path: string
  name: string
  sizeBytes: number
}

function getDemoPdfDir(): string {
  return process.env.DEMO_PDF_DIR ?? join(workspaceRoot, '.tmp', 'demo-pdfs')
}

function listDemoPdfs(): DemoPdf[] {
  const dir = getDemoPdfDir()

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    throw new Error(`No PDF files found in ${dir}. Place at least one PDF in .tmp/demo-pdfs/`)
  }

  const pdfs: DemoPdf[] = entries
    .filter((entry) => entry.toLowerCase().endsWith('.pdf'))
    .map((name) => {
      const path = join(dir, name)
      const stat = statSync(path)

      return { path, name, sizeBytes: stat.size }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (pdfs.length === 0) {
    throw new Error(`No PDF files found in ${dir}. Place at least one PDF in .tmp/demo-pdfs/`)
  }

  return pdfs
}

function pickRagPdf(): DemoPdf {
  const pdfs = listDemoPdfs()
  const minSize = 1024

  const sorted = [...pdfs].sort((a, b) => a.sizeBytes - b.sizeBytes)
  const candidate = sorted[0]

  if (candidate.sizeBytes < minSize) {
    throw new Error(
      `No PDF meets minimum size requirement (${minSize} bytes). Smallest PDF is ${candidate.name} at ${candidate.sizeBytes} bytes.`,
    )
  }

  return candidate
}

function pickQuotaUploadPlan(targetBytes: number = 52 * 1024 * 1024): DemoPdf[] {
  const pdfs = listDemoPdfs()
  const minTotalBytes = 50 * 1024 * 1024

  const sorted = [...pdfs].sort((a, b) => b.sizeBytes - a.sizeBytes)
  const selected: DemoPdf[] = []
  let accumulated = 0

  for (const pdf of sorted) {
    selected.push(pdf)
    accumulated += pdf.sizeBytes
    if (accumulated >= targetBytes) {
      return selected
    }
  }

  const totalMb = (accumulated / (1024 * 1024)).toFixed(2)
  console.warn(`Total PDF size (${totalMb} MB) is less than 50 MB. Skipping quota upload test.`)

  return []
}

export { listDemoPdfs, pickRagPdf, pickQuotaUploadPlan }
export type { DemoPdf }
