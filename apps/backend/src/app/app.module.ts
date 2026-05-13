import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from '../presentation/app.controller';
import { AuthController } from '../presentation/auth.controller';
import {
  FilesController,
  FileStatusController,
} from '../presentation/files.controller';
import { AdminController } from '../presentation/admin.controller';
import { ChatController } from '../presentation/chat.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any,
      },
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    FilesController,
    FileStatusController,
    AdminController,
    ChatController,
  ],
})
export class AppModule {}
