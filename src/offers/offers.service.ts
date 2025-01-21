import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { DieException } from 'src/common/exceptions/die.exception';

@Injectable()
export class OffersService {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl = this.configService.get<string>('STICKY_API_URL')
    this.username = this.configService.get<string>('STICKY_USERNAME');
    this.password = this.configService.get<string>('STICKY_PASSWORD');
  }

  async fetchOfferData(offerInfo: string, campaignId: number): Promise<any[]> {
    const decodedOfferInfo = JSON.parse(Buffer.from(offerInfo, 'base64').toString('utf-8'));
   
    const apiUrl = `${this.baseUrl}/api/v1/offer_view`;
    
    const data = { campaign_id: campaignId };

    try {
      const response = await lastValueFrom(this.httpService.post(apiUrl, data, {
        auth: {
          username: this.username,
          password: this.password
        },
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      }));
    
      const offersRequired = response.data.data.filter(offer => offer.id == decodedOfferInfo.offer_id);
      
      const offers = [];
      for (const offer of offersRequired) {
        
        for (const [productId, product] of Object.entries(offer.products)) {
          if (productId == decodedOfferInfo.product_id) {
            const offerToSend = {
              offer_id: offer.id,
              step_num: offer.id === 18 ? 1 : 3,
              product_id: productId,
              product_name: product,
              billing_model_id: offer.billing_models_detail[0].id,
            };

            if (offer.prepaid?.terms?.[0]?.cycles) {
              offerToSend['prepaid_cycles'] = offer.prepaid.terms[0].cycles;
            }

            if (offer.trial_flag === 1) {
              offerToSend['trial'] = { product_id: productId };
            }

            offers.push(offerToSend);
          }
        }
      }
      
      return offers;
    } catch (error) {
        console.error('Error fetching offer data:', error);
        throw new HttpException(
          {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            error: 'Failed to fetch offer data',
            message: error.message || 'An unexpected error occurred',
            details: error.response?.data || error.stack,
          },
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
  }
}

