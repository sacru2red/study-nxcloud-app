import { tags } from 'typia';

export interface ILoginRequest {
  email: string & tags.Format<'email'>;
  password: string & tags.MinLength<1>;
}

export interface ILoginResponse {
  accessToken: string;
  user: {
    userId: string & tags.Format<'uuid'>;
    email: string;
    tenantId: string & tags.Format<'uuid'>;
    role: 'admin' | 'user';
  };
}

export interface IJwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}
