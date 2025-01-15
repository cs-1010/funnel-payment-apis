import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StickyService } from './services/sticky.service';
import { ResponseService } from './services/response.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [StickyService, ResponseService],
  exports: [StickyService, ResponseService],
})
export class CommonModule {}