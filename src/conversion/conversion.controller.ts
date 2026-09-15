import { Body, Controller, Get, Post, UseGuards, Query, Res, Req, Logger } from '@nestjs/common';
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
    private readonly logger = new Logger(ConversionController.name);

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

    private buildCheckoutRedirectUrl(
        membersHost: string,
        offerId: string,
        productId: string,
        email: string,
        errorMessage?: string,
    ): string {
        const params = new URLSearchParams({
            offerId: offerId || '',
            productId: productId || '',
            email: email || '',
        });
        if (errorMessage) {
            params.set('error_found', '1');
            params.set('error_message', errorMessage.slice(0, 300));
        }
        return `https://${membersHost}/checkout-page?${params.toString()}`;
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
        @Query('debug') debug: string | undefined,
        @Req() req: Request,
        @Res() res: Response,
        @InjectIP() ipAddress: string
    ) {
        const membersHost = this.resolveMembersHost(req);
        const debugMode = debug === '1' || debug === 'true';
        const startedAt = Date.now();

        this.logger.log(
            `upsell-by-email start email=${upsellDto.email} offerId=${upsellDto.offerId} productId=${upsellDto.productId} membersHost=${membersHost} ip=${ipAddress} origin=${req.headers.origin || ''} referer=${req.headers.referer || ''}`,
        );

        let result: any;
        try {
            result = await this.conversionService.processUpsellByEmail(
                upsellDto.email,
                upsellDto.offerId,
                upsellDto.productId
            );
        } catch (error) {
            const errorMessage =
                error?.response?.message ||
                error?.message ||
                'Upsell processing failed';
            const elapsedMs = Date.now() - startedAt;

            this.logger.error(
                `upsell-by-email exception after ${elapsedMs}ms email=${upsellDto.email} offerId=${upsellDto.offerId} productId=${upsellDto.productId} membersHost=${membersHost}: ${errorMessage}`,
                error?.stack,
            );

            if (debugMode) {
                return res.status(500).json({
                    error_found: '1',
                    error_message: errorMessage,
                    email: upsellDto.email,
                    offerId: upsellDto.offerId,
                    productId: upsellDto.productId,
                    membersHost,
                    elapsedMs,
                    status: error?.status || error?.statusCode || null,
                });
            }

            return res.redirect(
                this.buildCheckoutRedirectUrl(
                    membersHost,
                    upsellDto.offerId,
                    upsellDto.productId,
                    upsellDto.email,
                    typeof errorMessage === 'string' ? errorMessage : 'Upsell processing failed',
                ),
            );
        }

        const elapsedMs = Date.now() - startedAt;
        const success = !!(result && result.order_id && !result.error_found);

        this.logger.log(
            `upsell-by-email done after ${elapsedMs}ms success=${success} order_id=${result?.order_id ?? ''} error=${result?.error_message || result?.errorMessage || result?.error || ''}`,
        );

        if (debugMode) {
            return res.status(success ? 200 : 400).json({
                success,
                membersHost,
                elapsedMs,
                result,
            });
        }

        if (success) {
            return res.redirect(`https://${membersHost}/order-confirmation?success=1`);
        }

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
        const errorMessage =
            result?.error_message ||
            result?.errorMessage ||
            (typeof result?.error === 'string' ? result.error : undefined) ||
            'Upsell processing failed';

        return res.redirect(
            this.buildCheckoutRedirectUrl(membersHost, offerId, productId, email, errorMessage),
        );
    }

}
