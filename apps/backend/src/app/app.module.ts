import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { join } from 'path'
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt'
import { ScheduleModule } from '@nestjs/schedule'
import { AppController } from '../presentation/app.controller'
import { AuthController } from '../presentation/auth.controller'
import { FilesController, FileStatusController } from '../presentation/files.controller'
import { AdminController, AdminTenantsController } from '../presentation/admin.controller'
import { ChatController } from '../presentation/chat.controller'
import { FolderController } from '../presentation/folder.controller'
import { JobSchedulerProvider } from '../providers/job-scheduler.provider'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../../../../.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      } as JwtSignOptions,
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    FilesController,
    FileStatusController,
    AdminTenantsController,
    AdminController,
    ChatController,
    FolderController,
  ],
  providers: [JobSchedulerProvider],
})
export class AppModule {}
