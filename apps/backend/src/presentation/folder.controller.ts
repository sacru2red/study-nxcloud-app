import { Controller, UseGuards } from '@nestjs/common'
import { TypedRoute, TypedParam, TypedBody } from '@nestia/core'
import { FolderProvider } from '../providers/folder.provider'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { IJwtPayload } from './auth.dto'
import { FolderDto } from './folder.dto'

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FolderController {
  @TypedRoute.Post(':folderId/chat')
  async chat(
    @TypedParam('folderId') folderId: string,
    @TypedBody() body: FolderDto.ChatRequest,
    @CurrentUser() user: IJwtPayload,
  ): Promise<FolderDto.ChatResponse> {
    return FolderProvider.chat(folderId, user.tenantId, user.userId, body.question)
  }
}
