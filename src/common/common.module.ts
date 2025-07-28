import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/exception.filter';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { JobService } from './services/job.service';
import { Job, JobSchema } from './schemas/job.schema';

@Module({
  imports: [
    HttpModule, 
    ConfigModule,
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    JobService,
  ],
  exports: [JobService],
})
export class CommonModule {} 