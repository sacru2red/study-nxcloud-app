import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common'
import { AuthenticatedRequest } from './jwt-auth.guard'

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required')
    }
    return true
  }
}
