# Nestia 사용 가이드

## 기본 CRUD

```typescript
import { Controller } from '@nestjs/common';
import { TypedBody, TypedParam, TypedRoute } from '@nestia/core';
import { tags } from 'typia';

export interface IDocument {
  documentId: string & tags.Format<'uuid'>;
  fileName: string;
  indexStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string & tags.Format<'date-time'>;
}

@Controller('tenants/:tenantId/files')
export class FilesController {
  @TypedRoute.Get()
  async list(
    @TypedParam('tenantId') tenantId: string & tags.Format<'uuid'>,
  ): Promise<IDocument[]> {
    return [];
  }

  @TypedRoute.Get(':fileId')
  async findOne(
    @TypedParam('tenantId') tenantId: string & tags.Format<'uuid'>,
    @TypedParam('fileId') fileId: string & tags.Format<'uuid'>,
  ): Promise<IDocument> {
    return null!;
  }

  @TypedRoute.Post()
  async create(
    @TypedParam('tenantId') tenantId: string & tags.Format<'uuid'>,
    @TypedBody() body: { fileName: string },
  ): Promise<IDocument> {
    return null!;
  }

  @TypedRoute.Delete(':fileId')
  async remove(
    @TypedParam('tenantId') tenantId: string & tags.Format<'uuid'>,
    @TypedParam('fileId') fileId: string & tags.Format<'uuid'>,
  ): Promise<void> {}
}
```

## Query String (페이지네이션)

```typescript
import { TypedQuery, TypedRoute } from '@nestia/core';
import { tags } from 'typia';

interface IPageQuery {
  page?: number & tags.Type<'uint32'>;
  limit?: number & tags.Type<'uint32'>;
}

@Controller('documents')
export class DocumentsController {
  @TypedRoute.Get()
  async list(
    @TypedQuery() query: IPageQuery,
  ): Promise<{ data: IDocument[]; total: number }> {
    return { data: [], total: 0 };
  }
}
```

## 파일 업로드 (Form Data)

```typescript
import { TypedFormData, TypedRoute } from '@nestia/core';
import multer from 'multer';

interface IFileUpload {
  file: IAttachment;
}

@Controller('upload')
export class UploadController {
  @TypedRoute.Post()
  async upload(
    @TypedFormData.Body(() => multer()) body: IFileUpload,
  ): Promise<IDocument> {
    return null!;
  }
}
```

## 예외 응답 정의

```typescript
import { TypedException, TypedBody, TypedRoute } from '@nestia/core';

@Controller('auth')
export class AuthController {
  @TypedRoute.Post('login')
  @TypedException<{ message: string }>(401, 'invalid credentials')
  @TypedException<{ message: string }>(404, 'user not found')
  async login(@TypedBody() body: ILoginRequest): Promise<ILoginResponse> {
    return null!;
  }
}
```

## Headers 처리

```typescript
import { TypedHeaders, TypedRoute } from '@nestia/core';
import { tags } from 'typia';

interface IAuthHeaders {
  authorization: string & tags.Pattern<`Bearer ${string}`>;
}

@Controller('protected')
export class ProtectedController {
  @TypedRoute.Get()
  async getProtectedData(
    @TypedHeaders() headers: IAuthHeaders,
  ): Promise<{ data: string }> {
    return { data: 'secret' };
  }
}
```

## DTO 패턴

### interface + typia tags (올바른 방식)

```typescript
import { tags } from 'typia';

interface ICreateUser {
  email: string & tags.Format<'email'>;
  password: string & tags.MinLength<8>;
  role?: 'admin' | 'user';
}
```

### namespace로 관련 타입 묶기

```typescript
export interface IChatSession {
  sessionId: string & tags.Format<'uuid'>;
  documentId: string & tags.Format<'uuid'>;
  messages: IChatMessage[];
}

export namespace IChatSession {
  export interface ICreate {
    documentId: string & tags.Format<'uuid'>;
    question: string;
  }
}
```

### 자주 쓰는 typia tags

| 태그                                        | 용도        |
| ------------------------------------------- | ----------- |
| `tags.Format<'uuid'>`                       | UUID 검증   |
| `tags.Format<'email'>`                      | 이메일 검증 |
| `tags.Format<'date-time'>`                  | ISO 날짜    |
| `tags.Pattern<'...'>`                       | 정규식      |
| `tags.MinLength<N>`, `tags.MaxLength<N>`    | 문자열 길이 |
| `tags.Type<'uint32'>`, `tags.Type<'int32'>` | 정수 범위   |
