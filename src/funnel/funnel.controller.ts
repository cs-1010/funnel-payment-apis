import { Body, Controller, Get, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { FunnelService } from './funnel.service';
import { get } from 'http';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { FunnelDto } from './dto/funnel.dto';
import { InjectIP } from '../common/decorators/inject-ip.decorator';
import { plainToClass } from 'class-transformer';
import { ResponseService } from 'src/common/services/response.service';
import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';
import { FunnelSeeder } from './seeder/funnel.seeder';
import { DieException } from 'src/common/exceptions/die.exception';

@Controller('conversion')
@UseGuards(ThrottlerGuard)
export class FunnelController {
    constructor(private readonly funnelService: FunnelService, private readonly responseService: ResponseService, private readonly funnelSeeder: FunnelSeeder) { }

    @Post()
    @Throttle({ default: { limit: 100, ttl: 60000 } })
    async create(@Body() funnelDto: FunnelDto, @InjectIP() ipAddress: string) {
        
        funnelDto.ipAddress = ipAddress;

        return await this.funnelService.process(funnelDto);
        
    }


    @Post("sync-prospect-custom-fields-and-tags")
    async syncProspectCustomFields(@Body() funnelDto: FunnelDto) {
        console.log("Sync prospect Custom Fields hit");
        await this.funnelService.addProspectCustomFields(funnelDto);
        await this.funnelService.syncProspectToActiveCampaign(funnelDto);
    }

    @Get("run-seeder")
    async runSeeder() {
        try {
            await this.funnelSeeder.seed();
            return { message: 'Funnel seeder executed successfully' };
        } catch (error) {
            throw new HttpException('Failed to run funnel seeder', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}
