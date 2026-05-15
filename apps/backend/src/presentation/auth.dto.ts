import { tags } from 'typia';
import { IJwtPayload } from '../common/types';

export namespace AuthDto {
  export interface LoginRequest {
    email: string & tags.Format<'email'>;
    password: string & tags.MinLength<1>;
  }

  export interface LoginResponse {
    accessToken: string;
    user: {
      userId: string & tags.Format<'uuid'>;
      email: string;
      tenantId: string & tags.Format<'uuid'>;
      role: 'admin' | 'user';
    };
  }

  export interface QuotaResponse {
    usedBytes: number;
    quotaBytes: number;
    usagePercent: number;
  }
}

export type { IJwtPayload };
