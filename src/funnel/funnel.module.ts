import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { FunnelService } from './funnel.service';
import { FunnelController } from './funnel.controller';
import { StickyService } from 'src/common/services/sticky.service';
import { ResponseService } from 'src/common/services/response.service';
import { CommonModule } from 'src/common/common.module';
import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';
import { FunnelSeeder } from './seeder/funnel.seeder';
import { Funnel, FunnelSchema } from './schemas/funnel.schema';

@Module({
  imports: [
    CommonModule,
    HttpModule,
    MongooseModule.forFeature([{ name: Funnel.name, schema: FunnelSchema }])
  ],
  controllers: [FunnelController],
  providers: [FunnelService, StickyService, ResponseService, ActiveCampaignService, FunnelSeeder],
})
export class FunnelModule {}

