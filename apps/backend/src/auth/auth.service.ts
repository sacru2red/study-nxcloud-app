import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ILoginRequest, ILoginResponse, IJwtPayload } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(request: ILoginRequest): Promise<ILoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: request.email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      request.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: IJwtPayload = {
      userId: user.userId,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

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

  async validatePayload(payload: IJwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { userId: payload.userId },
    });
    if (!user) {
      return null;
    }
    return payload;
  }
}
