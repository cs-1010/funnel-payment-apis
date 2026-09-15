import { Body, Controller, Get, Post, UseGuards, Query, Res, Req } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ConversionDto } from './dto/conversion.dto';
import { UpsellByEmailDto } from './dto/upsell-by-email.dto';
import { InjectIP } from '../common/decorators/inject-ip.decorator';
import { VrioService } from '../vrio/vrio.service';
import { Request, Response } from 'express';

const DEFAULT_MEMBERS_HOST = 'members.bigbudget.com';
const ALLOWED_MEMBERS_HOSTS = new Set([
    'members.bigbudget.com',
    'new-members.bigbudget.com',
]);

@Controller('conversion')
@UseGuards(ThrottlerGuard)
export class ConversionController {
    constructor(
        private readonly conversionService: ConversionService,
        private readonly vrioService: VrioService
    ) { }

    /**
     * Resolve redirect host from the calling members site (Origin/Referer).
     * Falls back to members.bigbudget.com when unknown.
     */
    private resolveMembersHost(req: Request): string {
        const candidates = [
            req.headers.origin,
            req.headers.referer,
        ];

        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'string') continue;
            try {
                const hostname = new URL(candidate).hostname.toLowerCase();
                if (ALLOWED_MEMBERS_HOSTS.has(hostname)) {
                    return hostname;
                }
            } catch {
                // ignore invalid URL
            }
        }

        return DEFAULT_MEMBERS_HOST;
    }

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

    @Get('upsell-by-email5')
    @Throttle({ default: { limit: 50, ttl: 60000 } })
    async upsellByEmail5(@Query() upsellDto: UpsellByEmailDto) {
        return await this.conversionService.processUpsellByEmail5(
            upsellDto.email,
            upsellDto.offerId,
            upsellDto.productId
        );
    }

    @Get('upsell-by-email')
    @Throttle({ default: { limit: 50, ttl: 60000 } })
    async upsellByEmail(
        @Query() upsellDto: UpsellByEmailDto,
        @Req() req: Request,
        @Res() res: Response,
        @InjectIP() ipAddress: string
    ) {
        const result = await this.conversionService.processUpsellByEmail(
            upsellDto.email,
            upsellDto.offerId,
            upsellDto.productId
        );

        const membersHost = this.resolveMembersHost(req);
        
        //return res.status(200).json(result);
        // Check if upsell was successful (has order_id)
        if (result && result.order_id && !result.error_found) {
            // Redirect to success URL
            return res.redirect(`https://${membersHost}/order-confirmation?success=1`);
        } else {
            // Extract offerId, productId, email - result can have different structures:
            // 1. VRIO error (payment failed): postedPayload.offers[0], postedPayload.email
            // 2. Early return from processUpsellByEmail: result.email, result.offerId, result.productId
            // 3. Fallback to original request params (upsellDto)
            const offerId = result?.postedPayload?.offers?.[0]?.offerId
                || result?.postedPayload?.mainOfferId
                || result?.offerId
                || upsellDto.offerId;
            const productId = result?.postedPayload?.offers?.[0]?.productId
                || result?.postedPayload?.mainProductId
                || result?.productId
                || upsellDto.productId;
            const email = result?.postedPayload?.email
                || result?.email
                || upsellDto.email;
            return res.redirect(`https://${membersHost}/checkout-page?offerId=${offerId}&productId=${productId}&email=${encodeURIComponent(email || '')}`);
        }
        
        // If failed, return error response
        return res.status(400).json(result || { error_message: 'Upsell processing failed', error_found: "1" });
    }

}
