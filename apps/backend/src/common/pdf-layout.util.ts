import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { join } from 'node:path'
import type { PdfBbox, PdfChunkRow, PdfPageParagraph } from './pdf-bbox.types'

GlobalWorkerOptions.workerSrc = join(
  process.cwd(),
  'node_modules',
  'pdfjs-dist',
  'legacy',
  'build',
  'pdf.worker.mjs',
)

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 100
const LINE_Y_TOLERANCE = 4

interface PdfTextItem {
  str: string
  transform: number[]
  width?: number
  height?: number
}

function isTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item &&
    typeof (item as PdfTextItem).str === 'string' &&
    Array.isArray((item as PdfTextItem).transform)
  )
}

function unionBbox(a: PdfBbox, b: PdfBbox): PdfBbox {
  const x1 = Math.min(a.x, b.x)
  const y1 = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

function bboxFromTextItem(item: PdfTextItem): PdfBbox {
  const [, , , , tx, ty] = item.transform
  const width = item.width ?? 0
  const height = item.height ?? Math.abs(item.transform[3] ?? 12)
  return {
    x: tx,
    y: ty,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  }
}

function clusterLines(
  items: Array<{ text: string; bbox: PdfBbox; y: number }>,
): Array<{ text: string; bbox: PdfBbox }> {
  if (items.length === 0) {
    return []
  }

  const sorted = [...items].sort((a, b) => b.y - a.y || a.bbox.x - b.bbox.x)
  const lines: Array<{ text: string; bbox: PdfBbox; y: number }> = []

  for (const item of sorted) {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= LINE_Y_TOLERANCE)
    if (line) {
      line.text = `${line.text} ${item.text}`.replace(/\s+/g, ' ').trim()
      line.bbox = unionBbox(line.bbox, item.bbox)
    } else {
      lines.push({ text: item.text, bbox: item.bbox, y: item.y })
    }
  }

  return lines.sort((a, b) => b.y - a.y).map((line) => ({ text: line.text, bbox: line.bbox }))
}

export async function extractPageParagraphsFromPdf(buffer: Buffer): Promise<PdfPageParagraph[]> {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise

  const paragraphs: PdfPageParagraph[] = []

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex)
    const textContent = await page.getTextContent()
    const rawItems: Array<{ text: string; bbox: PdfBbox; y: number }> = []

    for (const item of textContent.items) {
      if (!isTextItem(item)) {
        continue
      }
      const text = item.str.replace(/\s+/g, ' ').trim()
      if (!text) {
        continue
      }
      const bbox = bboxFromTextItem(item)
      rawItems.push({ text, bbox, y: bbox.y })
    }

    const lines = clusterLines(rawItems)
    lines.forEach((line, paragraphIndex) => {
      if (!line.text.trim()) {
        return
      }
      paragraphs.push({
        pageNo: pageIndex,
        paragraphNo: paragraphIndex,
        text: line.text,
        bbox: line.bbox,
      })
    })
  }

  return paragraphs
}

export function chunkParagraphs(paragraphs: PdfPageParagraph[]): PdfChunkRow[] {
  const chunks: PdfChunkRow[] = []
  const nextParagraphNoByPage = new Map<number, number>()

  for (const paragraph of paragraphs) {
    if (!paragraph.text.trim()) {
      continue
    }

    let paragraphNo = nextParagraphNoByPage.get(paragraph.pageNo) ?? 0
    let start = 0
    while (start < paragraph.text.length) {
      const end = Math.min(start + CHUNK_SIZE, paragraph.text.length)
      const slice = paragraph.text.slice(start, end).trim()
      if (slice) {
        chunks.push({
          pageNo: paragraph.pageNo,
          paragraphNo,
          text: slice,
          bbox: paragraph.bbox,
        })
        paragraphNo += 1
      }
      start += CHUNK_SIZE - CHUNK_OVERLAP
      if (end >= paragraph.text.length) {
        break
      }
    }
    nextParagraphNoByPage.set(paragraph.pageNo, paragraphNo)
  }

  return chunks
}

export function serializeBbox(bbox: PdfBbox | null): string | null {
  if (!bbox) {
    return null
  }
  return JSON.stringify(bbox)
}

export function parseBboxJson(raw: string | null): PdfBbox | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as PdfBbox
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}
