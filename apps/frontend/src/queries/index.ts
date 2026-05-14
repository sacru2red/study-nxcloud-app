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
      )
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
  fileName: string;
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
      )
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
      )
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
      )
  });
}

export function useUsersUsage(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['users-usage', tenantId],
    queryFn: () => {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }
      
      apiSdk.functional.admin.tenants.users_usage.getUsersUsage(
        connection,
        tenantId,
      )
    },
    enabled: !!tenantId,
  });
}
