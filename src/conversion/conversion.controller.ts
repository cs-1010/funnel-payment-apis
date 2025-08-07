import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConversionDto } from './dto/conversion.dto';
import { InjectIP } from '../common/decorators/inject-ip.decorator';

@Controller('conversion')
@UseGuards(ThrottlerGuard)
export class ConversionController {
    constructor(private readonly conversionService: ConversionService) { }

    @Post()
    @Throttle({ default: { limit: 50, ttl: 60000 } })
    async create(@Body() conversionDto: ConversionDto, @InjectIP() ipAddress: string) {
            
         conversionDto.ipAddress = ipAddress;
         
         return await this.conversionService.process(conversionDto);
    }


   /* @Post("sync-prospect-custom-fields-and-tags")
    async syncProspectCustomFields(@Body() conversionDto: ConversionDto) {
        console.log("Sync prospect Custom Fields hit");
        await this.conversionService.addProspectCustomFields(conversionDto);
        await this.conversionService.syncProspectToActiveCampaign(conversionDto);
    }*/

}
