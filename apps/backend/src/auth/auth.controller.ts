import { Controller } from '@nestjs/common';
import { TypedBody, TypedRoute } from '@nestia/core';
import { AuthService } from './auth.service';
import { ILoginRequest, ILoginResponse } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @TypedRoute.Post('login')
  async login(@TypedBody() body: ILoginRequest): Promise<ILoginResponse> {
    return this.authService.login(body);
  }
}
