import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { IJwtPayload } from '../types'
import { AuthenticatedRequest } from '../guards/jwt-auth.guard'

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IJwtPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    return request.user
  },
)
