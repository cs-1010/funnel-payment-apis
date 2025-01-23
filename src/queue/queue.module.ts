import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { QueueController } from "./queue.controller"
import { QueueService } from "./queue.service"
import { Job, JobSchema } from "./schemas/job.schema"

@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]), ConfigModule],
  controllers: [QueueController],
  providers: [
    QueueService,
    ConfigService, // Explicitly provide ConfigService
  ],
  exports: [QueueService],
})
export class QueueModule { }