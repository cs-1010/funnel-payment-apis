import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler"
import { APP_GUARD } from "@nestjs/core"
import { CommandModule } from "nestjs-command"

import { AppController } from "./app.controller"
import { AppService } from "./app.service"
import { ConversionModule } from "./conversion/conversion.module"
import { QueueModule } from "./queue/queue.module"
import { TestModule } from "./test/test.module"
import { ExampleModule } from "./example/example.module"
import { ActiveCampaignModule } from "./active-campaign/active-campaign.module"
import { GlobalExceptionFilter } from "./common/filters/exception.filter"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make ConfigModule global
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 5000,
      },
    ]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URI"),
      }),
      inject: [ConfigService],
    }),
    ConversionModule,
    QueueModule,
    TestModule,
    ExampleModule,
    ActiveCampaignModule,
    CommandModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    GlobalExceptionFilter,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }

