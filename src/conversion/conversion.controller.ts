import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConversionDto } from './dto/conversion.dto';
import { UpsellByEmailDto } from './dto/upsell-by-email.dto';
import { InjectIP } from '../common/decorators/inject-ip.decorator';
import { VrioService } from '../vrio/vrio.service';

@Controller('conversion')
@UseGuards(ThrottlerGuard)
export class ConversionController {
    constructor(
        private readonly conversionService: ConversionService,
        private readonly vrioService: VrioService
    ) { }

    @Post()
    @Throttle({ default: { limit: 50, ttl: 60000 } })
    async create(@Body() conversionDto: ConversionDto, @InjectIP() ipAddress: string) {
            
         conversionDto.ipAddress = ipAddress;
         
         return await this.conversionService.process(conversionDto);
    }

    @Get('test-vrio')
    async testVrio() {
        return await this.vrioService.testConnection();
    }

    
    @Post('test-upsell')
    async testUpsell(@Body() testData: any) {
        // Test upsell with sample data
        const sampleUpsellData = {
            customerId: testData.customerId || 1007,
            prevOrderId: testData.prevOrderId || 1011,
            cardId: testData.cardId || 1004,
            creditCardId: testData.creditCardId || 1004,
            customerBillingId: testData.customerBillingId || 1004,
            parentOfferId: testData.parentOfferId || 6,
            mainOfferId: testData.mainOfferId || "8",
            mainProductId: testData.mainProductId || "4",
            stickyCampaignId: testData.stickyCampaignId || 2,
            offers: testData.offers || [
                {
                    type: "MAIN",
                    offerId: 8,
                    productId: "4",
                    quantity: 1
                }
            ]
        };
        
        return await this.vrioService.processUpsell(sampleUpsellData);
    }

    @Post('upsell-by-email')
    @Throttle({ default: { limit: 50, ttl: 60000 } })
    async upsellByEmail(@Body() upsellDto: UpsellByEmailDto, @InjectIP() ipAddress: string) {
        return await this.conversionService.processUpsellByEmail(
            upsellDto.email,
            upsellDto.offerId,
            upsellDto.productId
        );
    }

}
