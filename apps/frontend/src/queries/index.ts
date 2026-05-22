import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getConnection } from '../api/client'
import { useSetAtom } from 'jotai'
import { tokenAtom, userAtom } from '../stores/auth'
import api from 'backend-sdk'

interface LoginRequest {
  email: string
  password: string
}

export function useLogin() {
  const setToken = useSetAtom(tokenAtom)
  const setUser = useSetAtom(userAtom)

  return useMutation({
    mutationFn: (data: LoginRequest) => {
      return api.functional.auth.login(getConnection(), data)
    },
    onSuccess: (res) => {
      setToken(res.accessToken)
      setUser(res.user)
    },
  })
}

export function useFiles(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['files', tenantId] as const,
    queryFn: async (ctx) => {
      const [, tenantIdFromQuery] = ctx.queryKey
      if (!tenantIdFromQuery) {
        throw new Error('Tenant ID is required')
      }

      return api.functional.tenants.files.list(getConnection(), tenantIdFromQuery)
    },
    enabled: !!tenantId,
    refetchInterval: (query) => {
      const files = query.state.data
      if (!files || files.length === 0) {
        return false
      }
      const hasIndexingFile = files.some(
        (file) => file.indexStatus === 'PENDING' || file.indexStatus === 'PROCESSING',
      )
      return hasIndexingFile ? 2000 : false
    },
  })
}

interface UploadFileInput {
  file: File
  folderId?: string
}

export function useUploadFile(tenantId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UploadFileInput | File) => {
      if (!tenantId) {
        throw new Error('Tenant ID is required')
      }
      const payload = input instanceof File ? { file: input } : input
      return api.functional.tenants.files.upload(getConnection(), tenantId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', tenantId] })
    },
  })
}

export function useChat(fileId: string) {
  return useMutation({
    mutationFn: (question: string) => {
      return api.functional.files.chat(getConnection(), fileId, { question })
    }
  })
}

export function useFolderChat(folderId: string) {
  return useMutation({
    mutationFn: (question: string) => {
      return api.functional.folders.chat(getConnection(), folderId, { question })
    }
  })
}

export function useQuota(enabled: boolean) {
  return useQuery({
    queryKey: ['quota'],
    queryFn: () => {
      return api.functional.auth.quota.getQuota(getConnection())
    },
    enabled,
  })
}

export function useAdminTenants(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-tenants'] as const,
    queryFn: () => api.functional.admin.tenants.listTenants(getConnection()),
    enabled,
  })
}

export function useUsersUsage(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['users-usage', tenantId] as const,
    queryFn: async (ctx) => {
      const [, tenantIdFromQuery] = ctx.queryKey
      if (!tenantIdFromQuery) {
        throw new Error('Tenant ID is required')
      }
      return api.functional.admin.tenants.users_usage.getUsersUsage(
        getConnection(),
        tenantIdFromQuery,
      )
    },
    enabled: !!tenantId,
  })
}

export function useRetryIndex() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) => {
      return api.functional.files.retry.retryIndex(getConnection(), fileId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      queryClient.invalidateQueries({ queryKey: ['index-status'] })
    },
  })
}

export function useIndexStatus(fileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['index-status', fileId] as const,
    queryFn: async (ctx) => {
      const [, fileIdFromQuery] = ctx.queryKey
      if (!fileIdFromQuery) {
        throw new Error('File ID is required')
      }
      return api.functional.files.index_status.indexStatus(getConnection(), fileIdFromQuery)
    },
    enabled: !!fileId && enabled,
    refetchInterval: (query) =>
      query.state.data?.status === 'COMPLETED' || query.state.data?.status === 'FAILED'
        ? false
        : 5000,
  })
}
