import {  Injectable, Logger } from '@nestjs/common';
import { ConversionDto } from './dto/conversion.dto';
import { StickyService } from 'src/common/services/sticky.service';

import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';
import { OffersService } from 'src/offers/offers.service';
import { JobService } from '../common/services/job.service';
import { HttpService } from '@nestjs/axios';
import { JobStatus, JobType } from '../common/dto/create-job.dto';
import { ConversionType } from './dto/conversion.dto';

@Injectable()
export class ConversionService {
  private readonly logger = new Logger(ConversionService.name);
  
  private failureReasons: string[] = [];
  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  private readonly shippingId: number;
  constructor(private readonly stickyService: StickyService, 
    private readonly jobService: JobService,
    private readonly activeCampaignService: ActiveCampaignService,
    private readonly offersService: OffersService,
    private readonly httpService: HttpService) {
    this.shippingId = 2; // Default value, as free shipping
    this.failureReasons = [
      "Insufficient Funds",
      "Do Not Honor",
      "This transaction has been declined",
      "Activity limit exceeded",
      "Pick up card - NF",
      "Pick up card - S",
      "Issuer Declined MCC"
    ]
  }


  async process(conversionDto: ConversionDto) {

    let response: any = null;
    // await this.getFunnelFromDatabase(funnelDto.fname, funnelDto.cId)
    switch (conversionDto.conversionType) {
      case ConversionType.SIGNUP:
        response = await this.processSignup(conversionDto);
        if(response.prospectId){
          await this.addProspectCustomFields({...conversionDto, prospectId: response.prospectId});
        }
        break;
      case ConversionType.PURCHASE:
        
        response = await this.processCheckout(conversionDto);
        break;
      case ConversionType.UPSELL:
        
        response = await this.processUpsell(conversionDto);
       
        break;
    }

    return response;
  }

  
  async processSignup(conversionDto: ConversionDto) {

    const prospectData:any = {
      campaignId: conversionDto.stickyCampaignId.toString(),
      email: conversionDto.email,
      firstName: conversionDto.firstName || '',
      lastName: conversionDto.lastName || '',
      phone: conversionDto.phone || '',
      city: conversionDto.city || conversionDto.city || '',
      zip: conversionDto.zip || conversionDto.zip || '',
      state: conversionDto.state || conversionDto.state || '',
      address1: conversionDto.address1 || '',
      country: 'US',
      ipAddress: conversionDto.ipAddress || '127.0.0.1',
      
    };

    const processedData = this.processOtherFields(prospectData, conversionDto);

    const response = await this.stickyService.findOrCreateProspect(processedData);

    const queueData = this.prepareQueueData(response, conversionDto, processedData);
    
    
        if (response.prospectId) {
          await this.jobService.createJob(JobType.SIGNUP,queueData);
      }else{

        await this.jobService.createJob(JobType.FAILED_SIGNUP,queueData);
      }
    
    return response;
  }
  async processCheckout(conversionDto: ConversionDto): Promise<any> {

    const offers = this.normalizeOffers(conversionDto.offers);
    
    // Check if offers are empty
    if (!offers || offers.length === 0) {
    
      await this.jobService.createJob(JobType.ERROR,{
        errorMessage : "Missing offers", 
        funnelId : conversionDto?.ftFunnelId, 
        nodeId : conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId
      });

      return { error_message: 'Payment failed, please contact support', error_found:"1" };    
    }
   
    // Filter offers based on mainOffer if provided
    let filteredOffers = [];
    let campaignId = null;
    
    if (conversionDto.mainOffer) {
      
      try {
        const selectedMainOffer = JSON.parse(Buffer.from(conversionDto.mainOffer, 'base64').toString('utf8'));
        const mainOfferId = selectedMainOffer.offerId.toString(); // Convert to string for comparison
        const mainProductId = selectedMainOffer.productId.toString();

        let bumpOfferId = null;
        
       
        const mainOfferObj = offers.find(offer => 
          offer.offerId === mainOfferId  
          && offer.productId === mainProductId
          && offer.type === "MAIN"
        );
        campaignId = mainOfferObj.campaignId;

        filteredOffers.push(mainOfferObj);
        // Only parse bumpOffer if it exists
        if (conversionDto.bumpOffer) {
          const selectedBumpOffer = JSON.parse(Buffer.from(conversionDto.bumpOffer, 'base64').toString('utf8'));
          bumpOfferId = selectedBumpOffer.offerId.toString(); 
          const bumpProductId = selectedBumpOffer.productId.toString();
          const bumpOfferObj = offers.find(offer => 
            offer.offerId === bumpOfferId && offer.type === "BUMP"
             && offer.productId === bumpProductId
          );
          filteredOffers.push(bumpOfferObj);
        }

      } catch (error) {
        console.error('Error parsing mainOffer:', error);
        // Fallback to original offers if parsing fails
      }
    }
    
    if (!filteredOffers || filteredOffers.length === 0) {
      //throw new HttpException("Invalid offers", HttpStatus.BAD_REQUEST);
      await this.jobService.createJob(JobType.ERROR,{
        errorMessage : "Invalid offers", 
        funnelId : conversionDto?.ftFunnelId, 
        nodeId : conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId
      });
      return { error_message: 'Payment failed, please contact support', error_found:"1" };
    }
 
    // Transform offers to the required format for checkout
    const transformedOffers = this.transformOffersForCheckout(filteredOffers);
    
    // Extract first and last name from cardHolderName
    const { firstName, lastName } = this.extractNamesFromCardHolder(conversionDto.cardHolderName);
    
    // Build base checkout data
    const checkoutData = {
      creditCardNumber: conversionDto.creditCardNumber.replace(/\s/g, ''),
      expirationDate: `${conversionDto.creditCardExpiryMonth}${conversionDto.creditCardExpiryYear.substring(conversionDto.creditCardExpiryYear.length - 2)}`,
      CVV: 'OVERRIDE',
      creditCardType: this.getCardType(conversionDto.creditCardNumber),
      tranType: 'Sale',
      shippingId:await this.getShippingId(campaignId),
      ipAddress: conversionDto.ipAddress,
      offers: transformedOffers,
      custom_fields: this.getOrderCustomFields(conversionDto, 'yes'),
      shippingCountry: "US",
      email: conversionDto.email,
      campaignId: campaignId,
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      
    };

    
        // Process additional fields and checkout
    const processedData = this.processOtherFields(checkoutData, conversionDto);

    let response = await this.stickyService.processNewOrder(processedData);

    // Handle fallback offers if main offer fails
    let data = { ...response };
    if (this.shouldHandleFallback(data)) {
      data = await this.handleFallbackCheckoutOffers(conversionDto, processedData, filteredOffers);
    }

    // Queue jobs based on result
    const queueData = this.prepareQueueData(data, conversionDto, checkoutData);
    
    if (response.resp_msg === "Approved") {
      this.jobService.createJob(JobType.SALE,queueData);
    } else {
      // Queue failed transactions
      this.jobService.createJob(JobType.FAILED_SALE,queueData);
    }

    return {
      ...data,
      conversionType: conversionDto.conversionType,
      firstName: checkoutData.firstName,
      lastName: checkoutData.lastName,
      zipCode: conversionDto.billingZip
    };
  }


  async processUpsell(conversionDto: ConversionDto): Promise<any> {

    const offers = this.normalizeOffers(conversionDto.offers);
    
    // Check if offers are empty
    if (!offers || offers.length === 0) {
      this.jobService.createJob(JobType.ERROR,{
        errorMessage : "Missing offers", 
        funnelId : conversionDto?.ftFunnelId, 
        nodeId : conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId
      });

      return { error_message: 'Payment failed, please contact support', error_found:"1" };    
    }
   
    // Filter offers based on mainOffer if provided
    let filteredOffers = [];
    let campaignId = null;
    
    if (conversionDto.mainOffer) {
      
      try {
        const selectedMainOffer = JSON.parse(Buffer.from(conversionDto.mainOffer, 'base64').toString('utf8'));
        const mainOfferId = selectedMainOffer.offerId.toString(); // Convert to string for comparison
         
        const mainOfferObj = offers.find(offer => 
          offer.offerId === mainOfferId && offer.type === "MAIN"
        );
        campaignId = mainOfferObj.campaignId;
        filteredOffers.push(mainOfferObj);
      
      } catch (error) {
        console.error('Error parsing mainOffer:', error);
        
      }
    }

    if (!filteredOffers || filteredOffers.length === 0) {
      //throw new HttpException("Invalid offers", HttpStatus.BAD_REQUEST);
      this.jobService.createJob(JobType.ERROR,{
        errorMessage : "Invalid offers", 
        funnelId : conversionDto?.ftFunnelId, 
        nodeId : conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId
      });

      return { error_message: 'Payment failed, please contact support', error_found:"1" };
    }

    
    const transformedOffers = this.transformOffersForCheckout(filteredOffers);
   
    
      const upsellData = {
        previousOrderId: conversionDto.preOrderId,
        shippingId: await this.getShippingId(campaignId),
        ipAddress: conversionDto.ipAddress,
        campaignId: campaignId,
        offers: transformedOffers,
        notes: "Upsell Purchased",
       // custom_fields: this.getOrderCustomFields(conversionDto, "no"),
      }

      const processedData = this.processOtherFields(upsellData, conversionDto);
      
      let response = await this.stickyService.processNewUpsell(processedData)

      let data = { ...response };
      if (this.shouldHandleFallback(data)) {
        data = await this.handleFallbackUpsellOffers(conversionDto, processedData, filteredOffers);
      }
  
      // Queue jobs based on result
      const queueData = this.prepareQueueData(data, conversionDto, processedData);

       
      if (data.resp_msg === "Approved") {
        this.jobService.createJob(JobType.UPSELL_SALE,queueData);
      } else {
        this.jobService.createJob(JobType.FAILED_SALE,queueData);
      }
  
      return queueData;
    
    //throw new HttpException("No valid offers found", HttpStatus.BAD_REQUEST)

  }
 

  private normalizeOffers(offers: any): any[] {
    if (Array.isArray(offers)) {
      return [...offers];
    } else if (offers && typeof offers === 'object') {
      const normalizedOffers = [];
      if (offers.main) {
        normalizedOffers.push({ ...offers.main });
      }
      if (offers.bump) {
        normalizedOffers.push({ ...offers.bump });
      }
      return normalizedOffers;
    }
    return [];
  }


  private shouldHandleFallback(data: any): boolean {
    return data.error_message
      && this.failureReasons.findIndex(reason => reason.toLowerCase() === data.error_message.toLowerCase()) !== -1;
  }

  private async handleFallbackCheckoutOffers(convertionlDto: ConversionDto, checkoutData: any, allOffers: any[]): Promise<any> {
    // Get fallback offers sorted by priority
    const fallbackOffers = allOffers
      .filter(offer => offer.type === "FALLBACK")
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // Get bump offers
    const bumpOffers = allOffers.filter(offer => offer.type === "BUMP");

    // Try each fallback offer with bump offers
    for (const fallbackOffer of fallbackOffers) {
      try {
        // Create new checkout data with fallback offer + bump offers

        checkoutData.campaignId = fallbackOffer.campaignId;
        const fallbackCheckoutData = {
          ...checkoutData,
          offers: this.transformOffersForCheckout([fallbackOffer, ...bumpOffers])
        };

        const response = await this.stickyService.processNewOrder(fallbackCheckoutData);
        
        if (response.resp_msg === "Approved") {
         
          return { ...response, isFallback: true, fallbackPriority: fallbackOffer.priority };
        }
        
      } catch (error) {
        console.error(`Error processing fallback offer with priority ${fallbackOffer.priority}:`, error);
        continue; // Try next fallback offer
      }
    }

    // If all fallback offers failed, return the last error
   // console.log('All fallback offers failed');
    const failedData = { error_message: 'All fallback offers failed', isFallback: true };
   
    return failedData;
  }

  private async handleFallbackUpsellOffers(convertionlDto: ConversionDto, checkoutData: any, allOffers: any[]): Promise<any> {
    // Get fallback offers sorted by priority
    const fallbackOffers = allOffers
      .filter(offer => offer.type === "FALLBACK")
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));
 
    // Try each fallback offer with bump offers
    for (const fallbackOffer of fallbackOffers) {
      try {
        // Create new checkout data with fallback offer + bump offers

        checkoutData.campaignId = fallbackOffer.campaignId;
        const fallbackCheckoutData = {
          ...checkoutData,
          offers: this.transformOffersForCheckout([fallbackOffer])
        };

        const response = await this.stickyService.processNewUpsell(fallbackCheckoutData);
        
        if (response.resp_msg === "Approved") {
         
          return { ...response, isFallback: true, fallbackPriority: fallbackOffer.priority };
        }
        
      } catch (error) {
        console.error(`Error processing fallback offer with priority ${fallbackOffer.priority}:`, error);
        continue; // Try next fallback offer
      }
    }

    // If all fallback offers failed, return the last error
   // console.log('All fallback offers failed');
    const failedData = { error_message: 'All fallback offers failed', isFallback: true };
   
    return failedData;
  }

  private transformOffersForCheckout(offers: any[]): any[] {
    return offers.map(offer => {

      const transformedOffer: any = {
        offer_id: offer.offerId,
        product_id: offer.productId,
        billing_model_id: offer.billingModelId,
        quantity: offer.quantity || "1"
      };

      // Add step_num if present
      if (offer.stepNum) {
        transformedOffer.step_num = offer.stepNum.toString();
      }

      // Add trial information if it's a trial offer
      if (offer.isTrial) {
        transformedOffer.trial = {
          product_id: offer.productId
        };
      }

      return transformedOffer;
    });
  }

  private extractNamesFromCardHolder(cardHolderName: string): { firstName: string; lastName: string } {
    if (!cardHolderName) {
      return { firstName: '', lastName: '' };
    }

    // Split by spaces and trim whitespace
    const nameParts = cardHolderName.trim().split(/\s+/);
    
    if (nameParts.length === 1) {
      // Only one name provided
      return { firstName: nameParts[0], lastName: '' };
    } else if (nameParts.length >= 2) {
      // First part is firstName, rest is lastName
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      return { firstName, lastName };
    }

    return { firstName: '', lastName: '' };
  }

  private prepareQueueData(responseData: any, conversionDto: ConversionDto, checkoutData: any): any {
    // Create a sanitized version of funnelDto without sensitive data
    const sanitizedFunnelDto = { ...conversionDto };
    
    // Mask credit card number to show only last 4 digits
    if (sanitizedFunnelDto.creditCardNumber) {
      const cardNumber = sanitizedFunnelDto.creditCardNumber.replace(/\s/g, '');
      sanitizedFunnelDto.creditCardNumber = cardNumber.length >= 4 
        ? `****${cardNumber.slice(-4)}` 
        : '****';
    }
    
    // Remove sensitive credit card fields
    delete sanitizedFunnelDto.creditCardExpiryMonth;
    delete sanitizedFunnelDto.creditCardExpiryYear;
    delete sanitizedFunnelDto.cvc;
    
    // Create a sanitized version of checkoutData without sensitive data
    const sanitizedCheckoutData = { ...checkoutData };
    
    // Mask credit card number in checkout data
    if (sanitizedCheckoutData.creditCardNumber) {
      const cardNumber = sanitizedCheckoutData.creditCardNumber.replace(/\s/g, '');
      sanitizedCheckoutData.creditCardNumber = cardNumber.length >= 4 
        ? `****${cardNumber.slice(-4)}` 
        : '****';
    }
    
    // Remove sensitive fields from checkout data
    delete sanitizedCheckoutData.creditCardExpiryMonth;
    delete sanitizedCheckoutData.creditCardExpiryYear;
    delete sanitizedCheckoutData.cvc;
    
    return {
      ...responseData,
      postedPayload: sanitizedFunnelDto,
      processedPayload: sanitizedCheckoutData,
      timestamp: new Date().toISOString()
    };
  }
  
 
  private processOtherFields(checkoutData: any, conversionDto: ConversionDto) {
    //filling other info
    if (conversionDto.lastAttribution.campaign_id) {
      checkoutData.AFFID = conversionDto.lastAttribution.campaign_id;
    }

    if (conversionDto.lastAttribution.campaign_id) {
      checkoutData.AFID = conversionDto.lastAttribution.campaign_id;
    }

    if (conversionDto.lastAttribution.h_ad_id) {
      checkoutData.SID = conversionDto.lastAttribution.h_ad_id;
    }

    if (conversionDto.lastAttribution.h_ad_id) {
      checkoutData.C1 = conversionDto.lastAttribution.h_ad_id;
    }

    if (conversionDto.c2) {
      checkoutData.C2 = conversionDto.c2;
    }    

    if (conversionDto.c3) {
      checkoutData.C3 = conversionDto.c3;
    }

    // Billing Fields
    if (conversionDto.billingAddress) {
      checkoutData.billingAddress1 = conversionDto.billingAddress;
    }
    if (conversionDto.billingCity) {
      checkoutData.billingCity = conversionDto.billingCity;
    }

    if (conversionDto.billingState) {
      checkoutData.billingState = conversionDto.billingState;
    }

    if (conversionDto.billingZip) {
      checkoutData.billingZip = conversionDto.billingZip;
    }
    
    if (conversionDto.billingCountry) {
      checkoutData.billingCountry = 'US';//conversionDto.billingCountry;
    }

    // UTM Parameters
    if (conversionDto.lastAttribution.utm_source) {
      checkoutData.utm_source = conversionDto.lastAttribution.utm_source;
    }

    if (conversionDto.lastAttribution.utm_medium) {
      checkoutData.utm_medium = conversionDto.lastAttribution.utm_medium;
    }

    if (conversionDto.lastAttribution.utm_campaign) {
      checkoutData.utm_campaign = conversionDto.lastAttribution.utm_campaign;
    }

    if (conversionDto.lastAttribution.utm_content) {
      checkoutData.utm_content = conversionDto.lastAttribution.utm_content;
    }

    if (conversionDto.lastAttribution.utm_term) {
      checkoutData.utm_term = conversionDto.lastAttribution.utm_term;
    }

    // Device Category
    if (conversionDto.deviceInfo.type) {
      checkoutData.device_category = conversionDto.deviceInfo.type;
    }

    if (conversionDto.lastAttribution._ef_transaction_id) {
      checkoutData.click_id = conversionDto.lastAttribution._ef_transaction_id;
    }

    return checkoutData;
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



  private getOrderCustomFields(funnelDto: ConversionDto, is_book: string = "no"): any[] {
    const fields = [];

    /*const fieldMappings = [
      { key: 'ga4_client_id', id: 14 },
     
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
 */

    fields.push({ id: 17, value: is_book });
    if (funnelDto.reasonForBuying) {
      fields.push({ id: 18, value: funnelDto.reasonForBuying });
    }

    return fields;
  }

  async addProspectCustomFields(funnelDto: ConversionDto) {
    try {

      const fields = [];
      
      if (funnelDto.reasonForBuying) {
        fields.push({ id: 7, value: funnelDto.reasonForBuying });
      }

      if (fields.length > 0 && funnelDto.prospectId) {
        const data = {
          custom_fields: fields
        };

        //this.logger.log(`Updating prospect ${funnelDto.prospectId} with custom fields:`, data);
        await this.stickyService.updateProspectCustomFields(funnelDto.prospectId, data);
        //this.logger.log(`Successfully updated prospect ${funnelDto.prospectId} custom fields`);
      } else {
        this.logger.log(`No custom fields to update for prospect ${funnelDto.prospectId}`);
      }
    } catch (error) {
      this.logger.error(`Error updating prospect custom fields:`, error);
      // Don't throw the error - just log it so it doesn't break the main flow
      // The job creation and other processes should continue
    }
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

  private async getShippingId(cId: number, freeShipping: boolean = true): Promise<number> {
    if (freeShipping === true) {
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

  
}
