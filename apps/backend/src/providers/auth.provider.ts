import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '../prisma';
import { IJwtPayload } from '../common/types';

export namespace AuthProvider {
  export const login = async (email: string, password: string) => {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    return { user };
  };

  export const signToken = async (
    jwtService: JwtService,
    payload: IJwtPayload,
  ) => {
    return jwtService.signAsync(payload);
  };

  export const validatePayload = async (payload: IJwtPayload) => {
    const user = await prisma.user.findUnique({
      where: { userId: payload.userId },
    });
    return user ? payload : null;
  };
}
