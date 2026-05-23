export interface PdfBbox {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfPageParagraph {
  pageNo: number
  paragraphNo: number
  text: string
  bbox: PdfBbox
}

export interface PdfChunkRow {
  pageNo: number
  paragraphNo: number
  text: string
  bbox: PdfBbox | null
}
