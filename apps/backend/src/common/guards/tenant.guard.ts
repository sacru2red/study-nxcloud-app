import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { IJwtPayload } from '../types';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();
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
