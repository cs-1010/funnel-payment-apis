import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConversionDto } from './dto/conversion.dto';
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

    @Post('test-checkout')
    async testCheckout(@Body() testData: any) {
        // Test checkout with sample data
        const sampleCheckoutData = {
            prevOrderId: testData.prevOrderId || 1010,
            customerId: testData.customerId || 1006,
            creditCardNumber: testData.creditCardNumber || "4444333322225332",
            creditCardExpiryMonth: testData.creditCardExpiryMonth || "08",
            creditCardExpiryYear: testData.creditCardExpiryYear || "2028",
            cvc: testData.cvc || "123",
            cardHolderName: testData.cardHolderName || "Test Card",
            billingAddress: testData.billingAddress || "12345 Bissonnet Street",
            billingCity: testData.billingCity || "Houston",
            billingState: testData.billingState || "TX",
            billingZip: testData.billingZip || "77099",
            isBump: testData.isBump || "1",
            offers: testData.offers || [
                {
                    type: "MAIN",
                    offerId: "6",
                    productId: "1",
                    quantity: 1
                },
                {
                    type: "BUMP",
                    offerId: "4",
                    productId: "3",
                    quantity: 1
                }
            ]
        };
        
        return await this.vrioService.processCheckout(sampleCheckoutData);
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

}
