import { Controller, UseGuards } from '@nestjs/common';
import { TypedRoute, TypedParam, TypedBody } from '@nestia/core';
import { ChatProvider } from '../providers/chat.provider';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IJwtPayload } from './auth.dto';
import { ChatDto } from './chat.dto';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class ChatController {
  @TypedRoute.Post(':fileId/chat')
  async chat(
    @TypedParam('fileId') fileId: string,
    @TypedBody() body: ChatDto.ChatRequest,
    @CurrentUser() user: IJwtPayload,
  ) {
    return ChatProvider.chat(fileId, user.tenantId, user.userId, body.question);
  }
}
