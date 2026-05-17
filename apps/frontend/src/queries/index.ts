import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connection } from '../api/client';
import { useSetAtom } from 'jotai';
import { tokenAtom, userAtom } from '../stores/auth';
import apiSdk from 'workspaceRoot/apps/backend/src/api';

interface LoginRequest {
  email: string;
  password: string;
}

export function useLogin() {
  const setToken = useSetAtom(tokenAtom);
  const setUser = useSetAtom(userAtom);

  return useMutation({
    mutationFn: (data: LoginRequest) => {
      return apiSdk.functional.auth.login(
        connection,
        data,
      );
    },
    onSuccess: (res) => {
      setToken(res.accessToken);
      setUser(res.user);
    },
  });
}

export interface DocumentResponse {
  documentId: string;
  tenantId: string;
  folderId: string | null;
  fileName: string;
  ncPath: string | null;
  ncDownloadUrl: string | null;
  fileSize: number;
  mimeType: string | null;
  indexStatus: string;
  pageCount: number;
  chunkCount: number;
  createdAt: string;
  indexedAt: string | null;
}

export function useFiles(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['files', tenantId] as const,
    queryFn: async (ctx) => {
      const [, tenantIdFromQuery] = ctx.queryKey;
      if (!tenantIdFromQuery) {
        throw new Error('Tenant ID is required');
      }

      return apiSdk.functional.tenants.files.list(
        connection,
        tenantIdFromQuery,
      );
    },
    enabled: !!tenantId,
  });
}

export function useUploadFile(tenantId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      return apiSdk.functional.tenants.files.upload(
        connection,
        tenantId,
        { file },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', tenantId] });
    },
  });
}

export function useChat(fileId: string) {
  return useMutation({
    mutationFn: (question: string) =>
      apiSdk.functional.files.chat(
        connection,
        fileId,
        { question },
      ),
  });
}

export function useFolderChat(folderId: string) {
  return useMutation({
    mutationFn: (question: string) =>
      apiSdk.functional.folders.chat(
        connection,
        folderId,
        { question },
      ),
  });
}

export function useQuota(enabled: boolean) {
  return useQuery({
    queryKey: ['quota'],
    queryFn: () =>
      apiSdk.functional.auth.quota.getQuota(
        connection,
      ),
    enabled,
  });
}

export function useUsersUsage(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['users-usage', tenantId],
    queryFn: () => {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      return apiSdk.functional.admin.tenants.users_usage.getUsersUsage(
        connection,
        tenantId,
      );
    },
    enabled: !!tenantId,
  });
}

export interface IndexStatusResponse {
  documentId: string;
  status: string;
  pageCount: number;
  chunkCount: number;
}

export function useIndexStatus(fileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['index-status', fileId],
    queryFn: () =>
      apiSdk.functional.files.index_status.indexStatus(
        connection,
        fileId!,
      ),
    enabled: !!fileId && enabled,
    refetchInterval: (query) =>
      query.state.data?.status === 'COMPLETED' || query.state.data?.status === 'FAILED'
        ? false
        : 5000,
  });
}
