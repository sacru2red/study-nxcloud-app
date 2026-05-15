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

## 규칙: @Injectable

@Injectable()을 사용한 서비스 클래스는 생성하지 않는다.

- prisma, axios 등 전역 객체는 생성해서 바로 변수로 공유한다.
- 서비스 클래스가 아닌 namespace로 함수묶음을 \*Provider로 내보내고, 사용한다.

## 규칙: @Controller

컨트롤러는 presentation 디렉토리에 모은다.
컨트롤러의 반환 타입은 명시적으로 DTO 타입을 생성하여 처리한다.
DTO는 {controllerName}.dto.ts에 만들고 네임스페이스 아래로 만들어 사용한다.
DTO에서 내보낸 파일은 컨트롤러에만 영향을 미쳐야한다. 비지니스로직이 들어있는 다른 파일에서는 사용하면 안된다.

## 규칙: typescript

일반적인 함수의 반환에서는 명시적인 반환 타입을 정하지 않고, 유연하게 작성한다.
