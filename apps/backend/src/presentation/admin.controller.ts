import { Controller, UseGuards } from '@nestjs/common';
import { TypedRoute, TypedParam } from '@nestia/core';
import { AdminProvider } from '../providers/admin.provider';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IJwtPayload } from './auth.dto';

@Controller('admin/tenants/:tenantId')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AdminController {
  @TypedRoute.Get('users-usage')
  async getUsersUsage(
    @TypedParam('tenantId') _tenantId: string,
    @CurrentUser() user: IJwtPayload,
  ) {
    if (user.role !== 'admin') throw new Error('Forbidden');
    return AdminProvider.getUsersUsage(user.tenantId);
  }
}
