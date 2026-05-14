import { Controller } from '@nestjs/common';
import { TypedRoute, TypedBody } from '@nestia/core';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider } from '../providers/auth.provider';
import { AuthDto, IJwtPayload } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly jwtService: JwtService) {}

  @TypedRoute.Post('login')
  async login(
    @TypedBody() body: AuthDto.LoginRequest,
  ): Promise<AuthDto.LoginResponse> {
    const { user } = await AuthProvider.login(body.email, body.password);

    const payload: IJwtPayload = {
      userId: user.userId,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    const accessToken = await AuthProvider.signToken(this.jwtService, payload);

    return {
      accessToken,
      user: {
        userId: user.userId,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role as 'admin' | 'user',
      },
    };
  }
}
