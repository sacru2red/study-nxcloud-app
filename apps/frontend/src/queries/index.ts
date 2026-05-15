import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'
import type { UserInfo } from '../stores/auth'
import { useSetAtom } from 'jotai'
import { tokenAtom, userAtom } from '../stores/auth'

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  accessToken: string
  user: UserInfo
}

export function useLogin() {
  const setToken = useSetAtom(tokenAtom)
  const setUser = useSetAtom(userAtom)

  return useMutation({
    mutationFn: (data: LoginRequest) =>
      client.post<LoginResponse>('/auth/login', data).then((r) => r.data),
    onSuccess: (res) => {
      setToken(res.accessToken)
      setUser(res.user)
    },
  })
}

export interface DocumentResponse {
  documentId: string
  tenantId: string
  folderId: string | null
  fileName: string
  ncPath: string | null
  ncDownloadUrl: string | null
  fileSize: number
  mimeType: string | null
  indexStatus: string
  pageCount: number
  chunkCount: number
  createdAt: string
  indexedAt: string | null
}

export function useFiles(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['files', tenantId],
    queryFn: () => client.get<DocumentResponse[]>(`/tenants/${tenantId}/files`).then((r) => r.data),
    enabled: !!tenantId,
  })
}

export function useUploadFile(tenantId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return client.post<DocumentResponse>(`/tenants/${tenantId}/files`, form).then((r) => r.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', tenantId] })
    },
  })
}

export function useChat(fileId: string) {
  return useMutation({
    mutationFn: (question: string) =>
      client
        .post<{
          answer: string
          sources: any[]
          sessionId: string
        }>(`/files/${fileId}/chat`, { question })
        .then((r) => r.data),
  })
}

export function useFolderChat(folderId: string) {
  return useMutation({
    mutationFn: (question: string) =>
      client
        .post<{
          answer: string
          sources: any[]
          sessionId: string | null
          documentCount: number
        }>(`/folders/${folderId}/chat`, { question })
        .then((r) => r.data),
  })
}

export interface UserUsage {
  userId: string
  email: string
  ncUserId: string
  role: string
  usedBytes: number
  quotaBytes: number
  usagePercent: number
}

export function useQuota(enabled: boolean) {
  return useQuery({
    queryKey: ['quota'],
    queryFn: () =>
      client
        .get<{
          usedBytes: number
          quotaBytes: number
          usagePercent: number
        }>('/auth/quota')
        .then((r) => r.data),
    enabled,
  })
}

export function useUsersUsage(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['users-usage', tenantId],
    queryFn: () =>
      client
        .get<{
          tenantId: string
          users: UserUsage[]
        }>(`/admin/tenants/${tenantId}/users-usage`)
        .then((r) => r.data),
    enabled: !!tenantId,
  })
}

export interface IndexStatusResponse {
  documentId: string
  status: string
  pageCount: number
  chunkCount: number
}

export function useIndexStatus(fileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['index-status', fileId],
    queryFn: () =>
      client.get<IndexStatusResponse>(`/files/${fileId}/index-status`).then((r) => r.data),
    enabled: !!fileId && enabled,
    refetchInterval: (query) =>
      query.state.data?.status === 'COMPLETED' || query.state.data?.status === 'FAILED'
        ? false
        : 5000,
  })
}
