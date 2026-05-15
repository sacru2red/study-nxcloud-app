import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { IJwtPayload } from '../types'
import { AuthenticatedRequest } from './jwt-auth.guard'

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user: IJwtPayload = request.user

    const tenantId = request.params['tenantId']
    if (!tenantId) {
      return true
    }

    const isUuid = /^[0-9a-f-]{36}$/i.test(tenantId)
    const expected = isUuid ? user.tenantId : user.ncGroupId

    if (expected !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant resources')
    }

    return true
  }
}
