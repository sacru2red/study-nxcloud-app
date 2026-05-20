import { BadRequestException, Controller, Get, NotFoundException, Res, UseGuards } from '@nestjs/common'
import { TypedRoute, TypedParam, TypedFormData } from '@nestia/core'
import Multer from 'multer'
import type { Response } from 'express'
import { FilesProvider } from '../providers/files.provider'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { TenantGuard } from '../common/guards/tenant.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { IJwtPayload } from './auth.dto'
import { FilesDto } from './files.dto'

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
        originalname: file.name,
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
  @TypedRoute.Get(':fileId/index-status')
  async indexStatus(
    @TypedParam('fileId') fileId: string,
    @CurrentUser() user: IJwtPayload,
  ): Promise<FilesDto.IndexStatusResponse> {
    return FilesProvider.getIndexStatus(fileId, user.tenantId)
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
      response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`)
      response.send(file.buffer)
    } catch {
      throw new NotFoundException('File not found')
    }
  }
}
