import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { VrioService } from './vrio.service';

@Module({
  imports: [HttpModule],
  providers: [VrioService],
  exports: [VrioService],
})
export class VrioModule {}
