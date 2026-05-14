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
    const request = context.switchToHttp().getRequest<Request>();
    const user: IJwtPayload = (request as any).user;

    const tenantId = request.params['tenantId'];
    if (!tenantId) {
      return true; // no tenant param to check
    }

    if (user.tenantId !== tenantId) {
      throw new ForbiddenException(
        'You do not have access to this tenant resources',
      );
    }

    return true;
  }
}
