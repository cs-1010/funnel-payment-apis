import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StickyService } from './sticky.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [StickyService],
  exports: [StickyService],
})
export class StickyModule {} 