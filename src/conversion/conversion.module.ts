import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConversionService } from './conversion.service';
import { ConversionController } from './conversion.controller';
import { CommonModule } from '../common/common.module';
import { ActiveCampaignModule } from '../active-campaign/active-campaign.module';
import { StickyModule } from '../sticky/sticky.module';
import { VrioModule } from '../vrio/vrio.module';


@Module({
  imports: [
    CommonModule,
    HttpModule,
    ActiveCampaignModule,
    StickyModule,
    VrioModule,
    
  ],
  controllers: [ConversionController],
  providers: [ConversionService],
})
export class ConversionModule {}

