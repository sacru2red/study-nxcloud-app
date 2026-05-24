import * as bcrypt from 'bcrypt'
import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { prisma } from '../prisma'
import { IJwtPayload } from '../common/types'
import { QuotaProvider } from './quota.provider'

export namespace AuthProvider {
  export const login = async (email: string, password: string) => {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    })

    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return { user }
  }

  export const signToken = async (jwtService: JwtService, payload: IJwtPayload) => {
    return jwtService.signAsync(payload)
  }

  export const validatePayload = async (payload: IJwtPayload) => {
    const user = await prisma.user.findUnique({
      where: { userId: payload.userId },
    })
    return user ? payload : null
  }

  export const getQuota = async (userId: string) => {
    return QuotaProvider.getUserQuota(userId)
  }
}
