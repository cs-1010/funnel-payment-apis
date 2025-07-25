import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { StickyService } from './services/sticky.service';
import { JobService } from './services/job.service';
import { Job, JobSchema } from './schemas/job.schema';


@Module({
  imports: [
    HttpModule, 
    ConfigModule,
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
  ],
  providers: [StickyService, JobService],
  exports: [StickyService, JobService],
})
export class CommonModule { }