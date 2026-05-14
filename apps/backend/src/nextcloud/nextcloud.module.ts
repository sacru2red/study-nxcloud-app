import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NextcloudService } from './nextcloud.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [NextcloudService],
  exports: [NextcloudService],
})
export class NextcloudModule {}
