import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { FunnelDto } from './dto/funnel.dto';
import { StickyService } from 'src/common/services/sticky.service';
import { ResponseService } from 'src/common/services/response.service';
import { DieException } from 'src/common/exceptions/die.exception';
import { QueueService } from 'src/queue/queue.service';
import { InjectModel } from '@nestjs/mongoose';
import { Funnel } from './schemas/funnel.schema';
import { Model } from 'mongoose';
import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';
import { OffersService } from 'src/offers/offers.service';
import { lastValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { CustomResponse } from 'src/common/interfaces/custom-response.interface';
import { JOBS } from 'src/common/Dto/job.dto';


@Injectable()
export class FunnelService {
  private funnel: Funnel | null = null;
  private failureReasons: string[] = [];

  private async getFunnelFromDatabase(fname: string, cId: number): Promise<void> {
    this.funnel = await this.funnelModel.findOne({ fname, cId }).exec()
    if (!this.funnel) {
      throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
    }
  }

  async syncProspectToActiveCampaign(funnelDto: FunnelDto) {
    try {
      // Find the funnel document
      const funnel = await this.funnelModel.findOne({
        cId: funnelDto.cId,
        fname: funnelDto.fname
      });

      if (!funnel) {
        throw new Error('Funnel not found');
      }

      // Prepare data for ActiveCampaign
      const data: any = {
        email: funnelDto.email,
        [`p[${funnel.prospectListId}]`]: funnel.prospectListId,
        tags: funnelDto.tags ? funnelDto.tags.join(',') : '',
        'field[47,0]': this.generateUniqueId()
      };

      // Handle name if provided
      if (funnelDto.firstName) {
        const nameTokens = funnelDto.firstName.split(' ');
        data.firstName = nameTokens[0];
        if (nameTokens.length > 1) {
          data.lastName = nameTokens.slice(1).join(' ');
        }
      }

      // Sync contact with ActiveCampaign
      const info = await this.activeCampaignService.syncContact(data);
      console.log('Contact synced with ActiveCampaign:', info);

      return info;
    } catch (error) {
      console.error('Error syncing prospect to ActiveCampaign:', error);
      throw error;
    }
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  private readonly shippingId: number;
  constructor(private readonly stickyService: StickyService, private readonly responseService: ResponseService, private readonly queueService: QueueService, @InjectModel(Funnel.name) private readonly funnelModel: Model<Funnel>,
    private readonly activeCampaignService: ActiveCampaignService,
    private readonly offersService: OffersService,
    private readonly httpService: HttpService) {
    this.shippingId = 2; // Default value, as free shipping
    this.failureReasons = [
      "Pick up card - SF",
      "Insufficient Funds",
      "Do Not Honor",
      "This transaction has been declined",
      "Activity limit exceeded",
      "Pick up card - NF",
      "Pick up card - S",
      "Issuer Declined MCC"
    ]
  }


  async process(funnelDto: FunnelDto) {

    let response: any = null;
    // await this.getFunnelFromDatabase(funnelDto.fname, funnelDto.cId)
    switch (funnelDto.ptype) {
      case 'vsl':
        response = await this.processVsl(funnelDto);
        const prospectId: string | null = response.prospectId ? response.prospectId : null;
        await this.queueService.addJob(JOBS.STICKY_PROSPECT_CUSTOM_FIELDS, { ...funnelDto, prospectId: prospectId });
        await this.queueService.addJob(JOBS.AC_UPDATE_LIST, { ...funnelDto, prospectId: prospectId });
        break;
      case 'checkout':
        response = await this.processCheckout(funnelDto);
        break;
      case 'upsell1':
      case 'upsell2':
      case 'upsell3':
      case 'upsell4':
        response = await this.processUpsellPage(funnelDto);
        await this.queueService.addJob(JOBS.AC_TAGS, { ...response });
        break;
    }

    return new CustomResponse(response, "Operation Completed Successfully", 200);
  }

  private getNextUrl(ptype: string, response: any): string {
    if (!this.funnel || !this.funnel.pages) {
      throw new Error("Funnel data not available")
    }

    const currentPageIndex = this.funnel.pages.findIndex((page) => page.type === ptype)
    if (currentPageIndex === -1) {
      throw new Error(`Page type ${ptype} not found in funnel`)
    }

    let nextPage: any = null

    // Check if there's an 'onbuy' property for the current page
    if (this.funnel.pages[currentPageIndex].onbuy) {
      nextPage = this.funnel.pages.find((page) => page.type === this.funnel.pages[currentPageIndex].onbuy)
    }

    // If no 'onbuy' or 'onbuy' page not found, get the next page in sequence
    if (!nextPage && currentPageIndex < this.funnel.pages.length - 1) {
      nextPage = this.funnel.pages[currentPageIndex + 1]
    }

    if (!nextPage) {
      return null;
    }

    // Return the page URL or rurl if available
    return nextPage.rurl || nextPage.page
  }

  async processUpsellPage(funnelDto: FunnelDto): Promise<any> {
    const upsellOffers = [];
    if (funnelDto.offers.main) {
      upsellOffers.push({ ...funnelDto.offers.main });
    }

    if (upsellOffers.length > 0) {
      const upsellData = {
        previousOrderId: funnelDto.previousOrderId,
        shippingId: await this.getShippingId(funnelDto.cId),
        ipAddress: funnelDto.ipAddress,
        campaignId: funnelDto.cId,
        offers: upsellOffers,
        notes: "Upsell Purchased",
        custom_fields: this.getOrderCustomFields(funnelDto, "no"),
      }

      let response = await this.stickyService.processNewUpsell(upsellData)

      if (response.error_message
        && this.failureReasons.findIndex(reason => reason.toLowerCase() == response.error_message.toLowerCase()) !== -1
        && funnelDto.fallbackOffers
        && funnelDto.fallbackOffers.fallbackCampaignId
        && funnelDto.fallbackOffers.offers
        && funnelDto.fallbackOffers.offers.findIndex(offer => offer.declinedProductId == upsellOffers[0].product_id) !== -1
      ) {
        response = await this.handleDeclineRedirectUpsell(upsellData, funnelDto, upsellOffers[0].product_id);
      }
      return { ...response, ...funnelDto };
    }

    throw new HttpException("No valid offers found", HttpStatus.BAD_REQUEST)
  }

  async handleDeclineRedirectUpsell(upsellData: any, funnelDto: FunnelDto, declineProductId: any) {
    upsellData.campaignId = funnelDto.fallbackOffers.fallbackCampaignId;
    upsellData.offers = [
      funnelDto.fallbackOffers.offers[funnelDto.fallbackOffers.offers.findIndex(offer => offer.declinedProductId == declineProductId)].offer
    ];

    let response = await this.stickyService.processNewUpsell(upsellData)
    return { ...response, isDeclineRedirect: 1 };
  }

  async processCheckout(funnelDto: FunnelDto): Promise<any> {
    let offers: any = [];
    if (funnelDto.offers.main) {
      offers.push({ ...funnelDto.offers.main });
    }

    if (funnelDto.offers.bump) {
      offers.push({ ...funnelDto.offers.bump })
    }




    let checkoutData: any = {};
    let isNewCheckout: boolean = false;
    if (funnelDto.prospectId) {
      // Prepare checkout data
      checkoutData = {
        prospectId: funnelDto.prospectId,
        creditCardNumber: funnelDto.credit_card_number.replace(/\s/g, ''),
        expirationDate: `${funnelDto.credit_card_expiry_month}${funnelDto.credit_card_expiry_year.substr(-2)}`,
        CVV: 'OVERRIDE',
        creditCardType: this.getCardType(funnelDto.credit_card_number),
        shippingId: (await this.getShippingId(funnelDto.cId)).toString(),
        tranType: 'Sale',
        ipAddress: funnelDto.ipAddress,
        campaignId: funnelDto.cId,
        offers: offers,
        custom_fields: this.getOrderCustomFields(funnelDto, 'yes')
      };

    } else {
      isNewCheckout = true;
      checkoutData = {
        creditCardNumber: funnelDto.credit_card_number.replace(/\s/g, ''),
        expirationDate: `${funnelDto.credit_card_expiry_month}${funnelDto.credit_card_expiry_year.substr(-2)}`,
        CVV: 'OVERRIDE',
        creditCardType: this.getCardType(funnelDto.credit_card_number),
        shippingId: (await this.getShippingId(funnelDto.cId)).toString(),
        tranType: 'Sale',
        ipAddress: funnelDto.ipAddress,
        campaignId: funnelDto.cId,
        offers: offers,
        custom_fields: this.getOrderCustomFields(funnelDto, 'yes'),
        shippingCountry: "US"
      };
      if (funnelDto.firstName) {
        checkoutData.firstName = funnelDto.firstName;
      }
      if (funnelDto.lastName) {
        checkoutData.lastName = funnelDto.lastName;
      }
      checkoutData.email = funnelDto.email;
    }



    checkoutData = this.processOtherFields(checkoutData, funnelDto);



    // Process checkout
    let response = await this.stickyService.processNewOrder(checkoutData, isNewCheckout);


    let data = { ...response, ...funnelDto };
    if (data.error_message
      && this.failureReasons.findIndex(reason => reason.toLowerCase() === data.error_message.toLowerCase()) !== -1
      && funnelDto.fallbackOffers
      && funnelDto.fallbackOffers.fallbackCampaignId
      && funnelDto.fallbackOffers.offer1
    ) {
      //handling decline redirect
      response = await this.handleDeclineRedirectOnCheckout(funnelDto, checkoutData, isNewCheckout);
      data = { ...response, ...funnelDto };
    }


    if (response.customerId) {
      this.queueService.addJob(JOBS.STICKY_ORDER_CUSTOM_FIELDS, data);
      this.queueService.addJob(JOBS.AC_TAGS, data);
    }

    return data;

  }
  async handleDeclineRedirectOnCheckout(funnelDto: FunnelDto, checkoutData: any, isNewCheckout: boolean) {
    checkoutData.campaignId = funnelDto.fallbackOffers.fallbackCampaignId;
    checkoutData.offers[0] = { ...funnelDto.fallbackOffers.offer1 };
    let data = await this.stickyService.processNewOrder(checkoutData, isNewCheckout);

    if (data.error_message
      && this.failureReasons.findIndex(reason => reason.toLowerCase() === data.error_message.toLowerCase())
      && funnelDto.fallbackOffers.offer2
    ) {
      checkoutData.offers[0] = { ...funnelDto.fallbackOffers.offer2 };
      data = await this.stickyService.processNewOrder(checkoutData, isNewCheckout);

    }
    return { ...data, ...checkoutData, isDeclineRedirect: 1 };

  }

  private processOtherFields(checkoutData: any, funnelDto: FunnelDto) {
    //filling other info
    if (funnelDto.AFFID) {
      checkoutData.AFFID = funnelDto.AFFID;
    }

    if (funnelDto.AFID) {
      checkoutData.AFID = funnelDto.AFID;
    }

    if (funnelDto.C1) {
      checkoutData.C1 = funnelDto.C1;
    }

    if (funnelDto.C2) {
      checkoutData.C2 = funnelDto.C2;
    }

    if (funnelDto.SID) {
      checkoutData.SID = funnelDto.SID;
    }

    if (funnelDto.C3) {
      checkoutData.C3 = funnelDto.C3;
    }
    return checkoutData;
  }

  private async sendDeclineFeed(data: any): Promise<void> {
    const processedData = this.toCamelCase(this.flattenArray(data));

    if (processedData.offerId0) {
      processedData.offerId = processedData.offerId0;
    }

    if (processedData.productId0) {
      processedData.productId = processedData.productId0;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post('https://rotator.creditsecrets.com/api/declinefeed', processedData, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        })
      );

      console.log('Decline feed response:', response.status, response.data);
    } catch (error) {
      console.error('Error sending decline feed:', error.response?.data || error.message);
    }
  }

  private toCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(v => this.toCamelCase(v));
    } else if (obj !== null && obj.constructor === Object) {
      return Object.keys(obj).reduce(
        (result, key) => ({
          ...result,
          [this.toCamelCaseString(key)]: this.toCamelCase(obj[key]),
        }),
        {},
      );
    }
    return obj;
  }

  private toCamelCaseString(str: string): string {
    return str.replace(/([-_][a-z])/g, group =>
      group.toUpperCase().replace('-', '').replace('_', '')
    );
  }

  private flattenArray(arr: any[], prefix: string = ''): any {
    return arr.reduce((acc, item, index) => {
      if (Array.isArray(item)) {
        return { ...acc, ...this.flattenArray(item, `${prefix}${index}`) };
      } else if (typeof item === 'object' && item !== null) {
        return { ...acc, ...this.flattenObject(item, `${prefix}${index}`) };
      }
      return { ...acc, [`${prefix}${index}`]: item };
    }, {});
  }

  private flattenObject(obj: any, prefix: string = ''): any {
    return Object.keys(obj).reduce((acc, k) => {
      const pre = prefix.length ? `${prefix}.` : '';
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        return { ...acc, ...this.flattenObject(obj[k], `${pre}${k}`) };
      }
      return { ...acc, [`${pre}${k}`]: obj[k] };
    }, {});
  }



  private getOrderCustomFields(funnelDto: FunnelDto, is_book: string = "no"): any[] {
    const fields = [];
    const fieldMappings = [
      { key: 'ga4_client_id', id: 14 },
      { key: 'ga4_session_id', id: 15 },
      { key: 'rt_variation_id', id: 13 },
      { key: 'rt_rotator_id', id: 16 },
      { key: 'utm_campaign_id', id: 22 },
      { key: 'device', id: 40 },
      { key: 'rt_funnel_id', id: 50 },
      { key: 'rt_step_id', id: 51 },
      { key: 'rt_variation_path', id: 52 },
      { key: 'fbclid', id: 56 },
      { key: 'fbpid', id: 58 },
      { key: 'user_agent', id: 60 },
      { key: 'gclid', id: 62 },
      { key: 'rt_params', id: 64 },
      { key: 'rt_funnel_name', id: 66 },
    ];

    for (const mapping of fieldMappings) {
      if (funnelDto[mapping.key]) {
        let value = funnelDto[mapping.key];
        if (mapping.key === 'rt_variation_id' || mapping.key === 'rt_rotator_id') {
          value = value.replace('#', '');
        }
        fields.push({ id: mapping.id, value: value });
      }
    }


    fields.push({ id: 17, value: is_book });

    return fields;
  }

  async addProspectCustomFields(funnelDto: FunnelDto) {
    const fields = [];
    const fieldMappings = [
      { key: 'rt_rotator_id', id: 21 },
      { key: 'rt_variation_id', id: 12 },
      { key: 'device', id: 39 },
      { key: 'ga4_client_id', id: 9 },
      { key: 'ga4_session_id', id: 10 },
      { key: 'rt_funnel_id', id: 47 },
      { key: 'rt_variation_path', id: 49 },
      { key: 'rt_step_id', id: 48 },
      { key: 'fbclid', id: 55 },
      { key: 'fbpid', id: 57 },
      { key: 'user_agent', id: 59 },
      { key: 'gclid', id: 61 },
      { key: 'rt_params', id: 63 },
      { key: 'rt_funnel_name', id: 65 },
    ];

    fieldMappings.forEach(mapping => {
      if (funnelDto[mapping.key]) {
        fields.push({ id: mapping.id, value: funnelDto[mapping.key] });
      }
    });

    if (funnelDto.quiz_answers) {
      const quizAnswers = JSON.parse(funnelDto.quiz_answers);
      quizAnswers.forEach(answer => {
        fields.push({ id: answer.id, value: answer.value });
      });
    }

    if (fields.length > 0 && funnelDto.prospectId) {
      const data = {
        custom_fields: fields
      };

      await this.stickyService.updateProspectCustomFields(funnelDto.prospectId, data);
    }
  }

  async processVsl(funnelDto: FunnelDto) {

    const response = await this.stickyService.findOrCreateProspect({ ...funnelDto }, funnelDto.cId.toString(), funnelDto.ipAddress);
    return { ...response, ...funnelDto };
  }
  private getCardType(cardNumber: string): string {
    const patterns = {
      visa: /^4\d{12}(?:\d{3})?$/,
      master: /^5[1-5]\d{14}$/,
      amex: /^3[47]\d{13}$/,
      discover: /^(?:6011|65\d{2}|64[4-9]\d)\d{12}$/
    };

    for (const [cardType, pattern] of Object.entries(patterns)) {
      if (pattern.test(cardNumber)) {
        return cardType;
      }
    }

    return "unknown";
  }

  private async getShippingId(cId: number, freeShipping?: number): Promise<number> {
    if (freeShipping === 1) {
      return this.shippingId;
    }

    try {
      const response = await this.stickyService.getCampaignView(cId);

      if (response.response_code === 100) {
        if (response.shipping && response.shipping.length >= 1) {
          for (const shipping of response.shipping) {
            if (shipping.shipping_id !== this.shippingId) {
              return shipping.shipping_id;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching shipping ID:', error);
    }

    return this.shippingId; // default free shipping
  }

  private async processUpsells(orderId: string, funnelDto: FunnelDto): Promise<void> {
    const otherOffers = funnelDto.offers.split(',').slice(1);
    for (const offerInfo of otherOffers) {
      const upsellOffers = await this.offersService.fetchOfferData(offerInfo, funnelDto.cId);
      if (upsellOffers.length > 0) {
        const upsellData = {
          previousOrderId: parseInt(orderId),
          shippingId: await this.getShippingId(funnelDto.cId),
          ipAddress: funnelDto.ipAddress,
          campaignId: funnelDto.cId,
          offers: upsellOffers,
          notes: 'SMC Purchased',
          custom_fields: this.getOrderCustomFields(funnelDto, 'no')
        };

        await this.stickyService.processNewUpsell(upsellData);
      }
    }
  }
}
