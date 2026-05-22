import { Controller, UseGuards } from '@nestjs/common'
import { TypedRoute, TypedParam } from '@nestia/core'
import { AdminProvider } from '../providers/admin.provider'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { AdminRoleGuard } from '../common/guards/admin-role.guard'
import { AdminDto } from './admin.dto'

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminTenantsController {
  @TypedRoute.Get('tenants')
  async listTenants(): Promise<AdminDto.TenantListResponse> {
    return AdminProvider.listTenants()
  }
}

@Controller('admin/tenants/:tenantId')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminController {
  @TypedRoute.Get('users-usage')
  async getUsersUsage(
    @TypedParam('tenantId') tenantId: string,
  ): Promise<AdminDto.UsersUsageResponse> {
    return AdminProvider.getUsersUsage(tenantId)
  }
}
