import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConversionModule } from './conversion/conversion.module';
import { CommonModule } from './common/common.module';
import { ActiveCampaignModule } from './active-campaign/active-campaign.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/funnel-payments'),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    CommonModule,
    ConversionModule,
    ActiveCampaignModule,
  
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
