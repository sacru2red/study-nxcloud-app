import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IJwtPayload } from '../../auth/dto';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IJwtPayload => {
    const request = context.switchToHttp().getRequest();
    return (request as any).user;
  },
);
