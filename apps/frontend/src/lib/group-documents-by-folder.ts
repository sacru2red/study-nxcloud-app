export interface DocumentListItem {
  documentId: string
  folderId: string | null
  fileName: string
  fileSize: number
  indexStatus: string
  ncDownloadUrl: string | null
  createdAt: string
}

export interface DocumentFolderGroup {
  folderKey: string | null
  label: string
  documents: DocumentListItem[]
}

export function groupDocumentsByFolder(documents: DocumentListItem[]): DocumentFolderGroup[] {
  const map = new Map<string | null, DocumentListItem[]>()

  for (const doc of documents) {
    const key = doc.folderId?.trim() ? doc.folderId.trim() : null
    const list = map.get(key) ?? []
    list.push(doc)
    map.set(key, list)
  }

  const sortByCreatedDesc = (a: DocumentListItem, b: DocumentListItem) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

  const groups: DocumentFolderGroup[] = [...map.entries()]
    .filter(([key]) => key !== null)
    .sort(([a], [b]) => (a as string).localeCompare(b as string, 'ko'))
    .map(([key, docs]) => ({
      folderKey: key,
      label: key as string,
      documents: [...docs].sort(sortByCreatedDesc),
    }))

  const unfiled = map.get(null)
  if (unfiled && unfiled.length > 0) {
    groups.push({
      folderKey: null,
      label: '미분류',
      documents: [...unfiled].sort(sortByCreatedDesc),
    })
  }

  return groups
}
