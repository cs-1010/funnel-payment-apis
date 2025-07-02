import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversionService } from './conversion.service';
import { ConversionController } from './conversion.controller';
import { CommonModule } from 'src/common/common.module';
import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';
import { OffersService } from 'src/offers/offers.service';
import { QueueModule } from 'src/queue/queue.module';
import { Job, JobSchema } from 'src/queue/schemas/job.schema';

//import { Conversion, ConversionSchema } from './schemas/conversion.schema';

@Module({
  imports: [
    CommonModule,
    HttpModule,
    //MongooseModule.forFeature([{ name: Conversion.name, schema: ConversionSchema }]),
    QueueModule,
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
  ],
  controllers: [ConversionController],
  providers: [
    ConversionService, 
    ActiveCampaignService, 
    OffersService
    // Removed: StickyService, ResponseService (provided by CommonModule)
    // Removed: QueueService (provided by QueueModule)
    // Removed: ConfigService (global)
  ],
})
export class ConversionModule { }

