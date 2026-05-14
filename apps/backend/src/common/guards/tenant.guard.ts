import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { IJwtPayload } from '../types';
import { AuthenticatedRequest } from './jwt-auth.guard';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: IJwtPayload = request.user;

    const tenantId = request.params['tenantId'];
    if (!tenantId) {
      return true;
    }

    if (user.tenantId !== tenantId) {
      throw new ForbiddenException(
        'You do not have access to this tenant resources',
      );
    }

    return true;
  }
}
