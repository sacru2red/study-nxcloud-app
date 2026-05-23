import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { IndexProgressData } from '../components/index-progress-display'
import { getConnection, getWsConnection } from '../api/client'
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
    // 상세 진행률은 WebSocket으로 받고, 목록의 indexStatus만 캐시 패치로 갱신
    refetchInterval: false,
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
      queryClient.invalidateQueries({ queryKey: ['quota'] })
    },
  })
}

export function useChat(fileId: string) {
  return useMutation({
    mutationFn: (question: string) => {
      return api.functional.files.chat(getConnection(), fileId, { question })
    },
  })
}

export function useFolderChat(folderId: string) {
  return useMutation({
    mutationFn: (question: string) => {
      return api.functional.folders.chat(getConnection(), folderId, { question })
    },
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
    },
  })
}

type IndexStatusSnapshot = Awaited<ReturnType<typeof api.functional.files.index_status.indexStatus>>

function toIndexProgress(data: IndexStatusSnapshot): IndexProgressData {
  return {
    phase: data.phase,
    progressPercent: data.progressPercent,
    message: data.message,
    totalChunks: data.totalChunks,
    embeddedChunks: data.embeddedChunks,
    pageCount: data.pageCount,
    diagnostic: data.diagnostic ?? null,
  }
}

interface IndexStatusWsSubscription {
  close: () => void
}

async function subscribeIndexStatusWs(
  documentId: string,
  onSnapshot: (snapshot: IndexStatusSnapshot) => void,
): Promise<IndexStatusWsSubscription> {
  let disposed = false
  let session: Awaited<ReturnType<typeof api.functional.files.index_status.indexStatusWs>> | null =
    null

  session = await api.functional.files.index_status.indexStatusWs(getWsConnection(), documentId, {
    onStatus: (snapshot) => {
      if (disposed) {
        return
      }
      onSnapshot(snapshot)
      if (snapshot.status === 'COMPLETED' || snapshot.status === 'FAILED') {
        disposed = true
        void session?.connector.close()
      }
    },
  })

  return {
    close: () => {
      if (disposed) {
        return
      }
      disposed = true
      void session?.driver.stop().catch(() => undefined)
      void session?.connector.close()
    },
  }
}

function patchFilesListCache(
  queryClient: QueryClient,
  documentId: string,
  snapshot: IndexStatusSnapshot,
) {
  queryClient.setQueriesData<Awaited<ReturnType<typeof api.functional.tenants.files.list>>>(
    { queryKey: ['files'] },
    (files) => {
      if (!files) {
        return files
      }
      return files.map((file) =>
        file.documentId === documentId
          ? {
              ...file,
              indexStatus: snapshot.status,
              pageCount: snapshot.pageCount,
              chunkCount: snapshot.chunkCount,
            }
          : file,
      )
    },
  )
}

/** 인덱싱 중·실패·대기 문서마다 index-status WebSocket만 구독 (HTTP GET index-status 없음) */
export function useProcessingIndexStatuses(documentIds: string[]) {
  const queryClient = useQueryClient()
  const [progressByDocumentId, setProgressByDocumentId] = useState<Map<string, IndexProgressData>>(
    () => new Map(),
  )
  const documentKey = useMemo(() => [...documentIds].sort().join(','), [documentIds])
  const connectGenerationRef = useRef(0)

  useEffect(() => {
    if (documentIds.length === 0) {
      setProgressByDocumentId(new Map())
      return
    }

    const generation = connectGenerationRef.current + 1
    connectGenerationRef.current = generation
    const subscriptions: IndexStatusWsSubscription[] = []
    let cancelled = false

    const applySnapshot = (documentId: string, snapshot: IndexStatusSnapshot) => {
      setProgressByDocumentId((prev) => {
        const next = new Map(prev)
        next.set(documentId, toIndexProgress(snapshot))
        return next
      })
      patchFilesListCache(queryClient, documentId, snapshot)
    }

    for (const documentId of documentIds) {
      void subscribeIndexStatusWs(documentId, (snapshot) => {
        if (cancelled || connectGenerationRef.current !== generation) {
          return
        }
        applySnapshot(documentId, snapshot)
      })
        .then((subscription) => {
          if (cancelled || connectGenerationRef.current !== generation) {
            subscription.close()
            return
          }
          subscriptions.push(subscription)
        })
        .catch(() => {
          // WS만 사용 — HTTP index-status 폴백 없음
        })
    }

    return () => {
      cancelled = true
      subscriptions.forEach((subscription) => subscription.close())
    }
  }, [documentKey, queryClient])

  return progressByDocumentId
}
