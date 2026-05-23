import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Res,
  UseGuards,
} from '@nestjs/common'
import { TypedRoute, TypedParam, TypedFormData, WebSocketRoute } from '@nestia/core'
import Multer from 'multer'
import type { Response } from 'express'
import { JwtService } from '@nestjs/jwt'
import type { WebSocketAcceptor } from 'tgrid'
import { FilesProvider } from '../providers/files.provider'
import { IndexStatusWsProvider } from '../providers/index-status-ws.provider'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { TenantGuard } from '../common/guards/tenant.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { IJwtPayload } from './auth.dto'
import { FilesDto } from './files.dto'
import { normalizeUploadFileName } from '../common/decode-upload-filename'

@Controller('tenants/:tenantId/files')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FilesController {
  @TypedRoute.Post()
  async upload(
    @TypedParam('tenantId') _tenantId: string,
    @CurrentUser() user: IJwtPayload,
    @TypedFormData.Body(() => Multer()) body: FilesDto.IUploadBody,
  ): Promise<FilesDto.FileItem> {
    const file = body.file
    return FilesProvider.uploadFile(
      user.tenantId,
      user.userId,
      {
        originalname: normalizeUploadFileName(file.name),
        buffer: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        size: file.size,
      },
      body.folderId,
    )
  }

  @TypedRoute.Get()
  async list(
    @TypedParam('tenantId') _tenantId: string,
    @CurrentUser() user: IJwtPayload,
  ): Promise<FilesDto.FileItem[]> {
    return FilesProvider.listFiles(user.tenantId)
  }
}

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileStatusController {
  constructor(private readonly jwtService: JwtService) {}

  @TypedRoute.Get(':fileId/index-status')
  async indexStatus(
    @TypedParam('fileId') fileId: string,
    @CurrentUser() user: IJwtPayload,
  ): Promise<FilesDto.IndexStatusResponse> {
    return FilesProvider.getIndexStatus(fileId, user.tenantId)
  }

  /**
   * 인덱싱 진행 상태를 WebSocket으로 스트리밍합니다 (약 2초 간격).
   */
  @WebSocketRoute(':fileId/index-status')
  async indexStatusWs(
    @WebSocketRoute.Param('fileId') fileId: string,
    @WebSocketRoute.Header() header: FilesDto.IIndexStatusWsHeader,
    @WebSocketRoute.Acceptor()
    acceptor: WebSocketAcceptor<
      FilesDto.IIndexStatusWsHeader,
      FilesDto.IIndexStatusWsProvider,
      FilesDto.IIndexStatusWsListener
    >,
  ): Promise<void> {
    const tenantId = await this.resolveTenantIdFromHeader(header)
    if (!tenantId) {
      await acceptor.reject(1008, 'Unauthorized')
      return
    }

    try {
      await FilesProvider.getIndexStatus(fileId, tenantId)
    } catch {
      await acceptor.reject(1008, 'Document not found')
      return
    }

    const provider = new IndexStatusWsProvider(fileId, tenantId, acceptor.getDriver())
    await acceptor.accept(provider)
    void provider.run().catch(() => {
      provider.stop()
    })
  }

  private async resolveTenantIdFromHeader(
    header: FilesDto.IIndexStatusWsHeader & { Authorization?: string },
  ): Promise<string | null> {
    const raw = (header.authorization ?? header.Authorization)?.trim()
    if (!raw) {
      return null
    }
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw
    if (!token) {
      return null
    }
    try {
      const payload = await this.jwtService.verifyAsync<IJwtPayload>(token)
      return payload.tenantId
    } catch {
      return null
    }
  }

  @TypedRoute.Post(':fileId/retry')
  async retryIndex(
    @TypedParam('fileId') fileId: string,
    @CurrentUser() user: IJwtPayload,
  ): Promise<FilesDto.RetryResponse> {
    return FilesProvider.retryIndex(fileId, user.tenantId)
  }

  @Get(':fileId/content')
  async content(
    @TypedParam('fileId') fileId: string,
    @CurrentUser() user: IJwtPayload,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const file = await FilesProvider.getFileContent(fileId, user.tenantId)
      response.setHeader('Content-Type', file.mimeType)
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.fileName)}"`,
      )
      response.send(file.buffer)
    } catch {
      throw new NotFoundException('File not found')
    }
  }
}
