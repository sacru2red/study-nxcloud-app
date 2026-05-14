# Backend (NestJS + Nestia) Coding Conventions

## 규칙: @nestia/core 데코레이터만 사용

`@nestjs/common`의 라우트/파라미터 데코레이터 사용 금지. 대신 `@nestia/core` 사용.

### 금지 → 필수 매핑

| 금지 (`@nestjs/common`)                            | 필수 (`@nestia/core`)                                         |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `@Get()` `@Post()` `@Put()` `@Patch()` `@Delete()` | `@TypedRoute.Get()` `.Post()` `.Put()` `.Patch()` `.Delete()` |
| `@Body()`                                          | `@TypedBody()`                                                |
| `@Param()`                                         | `@TypedParam()`                                               |
| `@Query()`                                         | `@TypedQuery()`                                               |
| `@Headers()`                                       | `@TypedHeaders()`                                             |
| `@Body()` + multer                                 | `@TypedFormData.Body()`                                       |
| 수동 예외 정의                                     | `@TypedException()`                                           |

> `@Controller()`만 `@nestjs/common`에서 가져옴. 이것만 예외 허용.

### DTO 규칙

- `class` + `class-validator` 금지. **`interface` + `typia tags`** 사용.
- 관련 타입은 `namespace` 패턴으로 묶기.
- 자주 쓰는 tags: `tags.Format<'uuid'>`, `tags.Format<'email'>`, `tags.MinLength<N>`, `tags.Type<'uint32'>`

### 상세 예제

> [docs/nestia-guide.md](../../docs/nestia-guide.md) 참고
