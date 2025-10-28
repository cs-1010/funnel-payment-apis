import {  Injectable, Logger } from '@nestjs/common';
import { ConversionDto } from './dto/conversion.dto';
import { StickyService } from '../sticky/sticky.service';
import { VrioService } from '../vrio/vrio.service';

import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';

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
    private readonly vrioService: VrioService,
    private readonly jobService: JobService,
    private readonly activeCampaignService: ActiveCampaignService,
  
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
    // Map mainOrderId to prevOrderId if mainOrderId is provided
    if (conversionDto.mainOrderId && !conversionDto.prevOrderId) {
      conversionDto.prevOrderId = conversionDto.mainOrderId;
      this.logger.log(`Mapped mainOrderId ${conversionDto.mainOrderId} to prevOrderId`);
    }
    
    // Map preOrderId to prevOrderId if preOrderId is provided
    if (conversionDto.preOrderId && !conversionDto.prevOrderId) {
      conversionDto.prevOrderId = conversionDto.preOrderId;
      this.logger.log(`Mapped preOrderId ${conversionDto.preOrderId} to prevOrderId`);
    }

    let response: any = null;
    // await this.getFunnelFromDatabase(funnelDto.fname, funnelDto.cId)
    switch (conversionDto.conversionType) {
      case ConversionType.SIGNUP:
        response = await this.processSignup(conversionDto);
        // Comment out Sticky custom fields update - VRIO handles this differently
        // if(response.prospectId){
        //   await this.addProspectCustomFields({...conversionDto, prospectId: response.prospectId});
        // }
        break;
      case ConversionType.PURCHASE:
        
        response =await this.processCheckout(conversionDto);
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
      state: conversionDto.state || 'CA',
      address1: conversionDto.address1 || '',
      country: 'US',
      ipAddress: conversionDto.ipAddress || '127.0.0.1',
      reasonForBuying: conversionDto.reasonForBuying,
      lastAttribution: conversionDto.lastAttribution,
    };

    // Process additional fields for VRIO (no longer need AFID, SID, etc. as per requirements)
    const processedData = this.processVrioFields(prospectData, conversionDto);

    // Use VRIO service instead of Sticky
    const response = await this.vrioService.createProspect(processedData);

    // Comment out Sticky service call
    // const response = await this.stickyService.findOrCreateProspect(processedData);

    const queueData = this.prepareQueueData(response, conversionDto, processedData);
    
    
        if (response?.order_id && response?.customer_id) {
          await this.jobService.createJob(JobType.SIGNUP,queueData);
      }else{

        await this.jobService.createJob(JobType.FAILED_SIGNUP,queueData);
      }
    
    return response;
  }
  async processCheckout(conversionDto: ConversionDto): Promise<any> {

    const offers = this.normalizeOffers(conversionDto.offers);
     // Determine first and last names for response
     const { firstName, lastName } = this.determineNames(conversionDto);
     conversionDto.firstName = firstName;
     conversionDto.lastName = lastName;
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

    // Scenario 1: No prevOrderId and customerId, but email is provided - create prospect first
    if ((!conversionDto.prevOrderId && !conversionDto.customerId) && conversionDto.email) {
      this.logger.log('Scenario 1: Creating prospect first, then checkout');
      
      // Create prospect first
      const prospectData = {
        campaignId: conversionDto.stickyCampaignId.toString(),
        email: conversionDto.email,
        firstName: conversionDto.firstName || '',
        lastName: conversionDto.lastName || '',
        phone: conversionDto.phone || '',
        city: conversionDto.city || '',
        zip: conversionDto.zip || '',
        state: conversionDto.state || 'CA',
        address1: conversionDto.address1 || '',
        country: 'US',
        ipAddress: conversionDto.ipAddress || '127.0.0.1',
        reasonForBuying: conversionDto.reasonForBuying,
        lastAttribution: conversionDto.lastAttribution,
      };

      const processedProspectData = this.processVrioFields(prospectData, conversionDto);
      const prospectResponse = await this.vrioService.createProspect(processedProspectData);

      if (prospectResponse?.customer_id) {
        // Now proceed with checkout using the created customer
        conversionDto.customerId = prospectResponse.customer_id;
        conversionDto.prevOrderId = prospectResponse.order_id;
        this.logger.log(`Prospect created successfully. Customer ID: ${prospectResponse.customer_id}, Order ID: ${prospectResponse.order_id}`);
      } else {
        this.logger.error('Failed to create prospect, cannot proceed with checkout');
        await this.jobService.createJob(JobType.ERROR, {
          errorMessage: "Failed to create prospect",
          funnelId: conversionDto?.ftFunnelId,
          nodeId: conversionDto?.ftNodeId,
          visitorId: conversionDto.visitorId,
          ipAddress: conversionDto.ipAddress,
          accountId: conversionDto.accountId
        });
        return { error_message: 'Failed to create prospect, please contact support', error_found: "1" };
      }
    }

    // Scenario 1.5: Have prevOrderId but no customerId - create prospect first, then checkout
    if (conversionDto.prevOrderId && !conversionDto.customerId && conversionDto.email) {
      this.logger.log('Scenario 1.5: Have prevOrderId but no customerId - creating prospect first, then checkout');
      
      // Create prospect first
      const prospectData = {
        campaignId: conversionDto.stickyCampaignId.toString(),
        email: conversionDto.email,
        firstName: conversionDto.firstName || '',
        lastName: conversionDto.lastName || '',
        phone: conversionDto.phone || '',
        city: conversionDto.city || '',
        zip: conversionDto.zip || '',
        state: conversionDto.state || 'CA',
        address1: conversionDto.address1 || '',
        country: 'US',
        ipAddress: conversionDto.ipAddress || '127.0.0.1',
        reasonForBuying: conversionDto.reasonForBuying,
        lastAttribution: conversionDto.lastAttribution,
      };

      const processedProspectData = this.processVrioFields(prospectData, conversionDto);
      const prospectResponse = await this.vrioService.createProspect(processedProspectData);

      if (prospectResponse?.customer_id) {
        // Now proceed with checkout using the created customer
        conversionDto.customerId = prospectResponse.customer_id;
        this.logger.log(`Prospect created successfully. Customer ID: ${prospectResponse.customer_id}, using existing Order ID: ${conversionDto.prevOrderId}`);
      } else {
        this.logger.error('Failed to create prospect, cannot proceed with checkout');
        await this.jobService.createJob(JobType.ERROR, {
          errorMessage: "Failed to create prospect",
          funnelId: conversionDto?.ftFunnelId,
          nodeId: conversionDto?.ftNodeId,
          visitorId: conversionDto.visitorId,
          ipAddress: conversionDto.ipAddress,
          accountId: conversionDto.accountId
        });
        return { error_message: 'Failed to create prospect, please contact support', error_found: "1" };
      }
    }

    // Scenario 2: Direct checkout with existing prevOrderId and customerId
    if (conversionDto.prevOrderId && conversionDto.customerId) {
      this.logger.log('Scenario 2: Direct checkout with existing customer');
      
      // Update customer first and last name in VRIO if available
      if (conversionDto.firstName || conversionDto.lastName) {
        try {
          this.logger.log(`Updating customer ${conversionDto.customerId} with firstName: ${conversionDto.firstName}, lastName: ${conversionDto.lastName}`);
          await this.vrioService.updateCustomer(conversionDto.customerId, {
            firstName: conversionDto.firstName,
            lastName: conversionDto.lastName
          });
          this.logger.log('Customer update completed successfully');
        } catch (error) {
          this.logger.error('Failed to update customer in VRIO:', error);
          // Continue with checkout even if customer update fails
        }
      }
      
      // Prepare checkout data for VRIO
      const checkoutData = {
        prevOrderId: conversionDto.prevOrderId,
        customerId: conversionDto.customerId,
        creditCardNumber: conversionDto.creditCardNumber,
        creditCardExpiryMonth: conversionDto.creditCardExpiryMonth,
        creditCardExpiryYear: conversionDto.creditCardExpiryYear,
        cvc: conversionDto.cvc,
        cardHolderName: conversionDto.cardHolderName,
        firstName: conversionDto.firstName,
        lastName: conversionDto.lastName,
        billingAddress: conversionDto.billingAddress,
        billingCity: conversionDto.billingCity,
        billingState: conversionDto.billingState,
        billingZip: conversionDto.billingZip,
        billingCountry: conversionDto.billingCountry,
        isBump: conversionDto.isBump,
        mainOfferId: conversionDto.mainOfferId,
        mainProductId: conversionDto.mainProductId,
        bumpOfferId: conversionDto.bumpOfferId,
        bumpProductId: conversionDto.bumpProductId,
        offers: offers,
      };

      
      // Use VRIO service for checkout
      const response = await this.vrioService.processCheckout(checkoutData);

      // Comment out Sticky service call
      // const response = await this.stickyService.processNewOrder(processedData);

      const queueData = this.prepareQueueData(response, conversionDto, checkoutData);
      
      if (response?.order_id) {
        await this.jobService.createJob(JobType.SALE, queueData);
      } else {
        await this.jobService.createJob(JobType.FAILED_SALE, queueData);
      }

     

      return {
        ...response,
        conversionType: conversionDto.conversionType,
        firstName: firstName,
        lastName: lastName,
        zipCode: conversionDto.billingZip
      };
    }

    // If neither scenario is met, return error
    await this.jobService.createJob(JobType.ERROR, {
      errorMessage: "Invalid checkout scenario - missing required data",
      funnelId: conversionDto?.ftFunnelId,
      nodeId: conversionDto?.ftNodeId,
      visitorId: conversionDto.visitorId,
      ipAddress: conversionDto.ipAddress,
      accountId: conversionDto.accountId
    });

    return { error_message: 'Invalid checkout data, please contact support', error_found: "1" };
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

    // Validate required fields for upsell
    if (!conversionDto.customerId) {
      this.jobService.createJob(JobType.ERROR, {
        errorMessage: "Customer ID is required for upsell",
        funnelId: conversionDto?.ftFunnelId,
        nodeId: conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId
      });
      return { error_message: 'Customer ID is required for upsell', error_found: "1" };
    }

    if (!conversionDto.prevOrderId) {
      this.jobService.createJob(JobType.ERROR, {
        errorMessage: "Previous order ID is required for upsell",
        funnelId: conversionDto?.ftFunnelId,
        nodeId: conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId
      });
      return { error_message: 'Previous order ID is required for upsell', error_found: "1" };
    }

    this.logger.log('Processing upsell with VRIO');

    // Prepare upsell data for VRIO
    const upsellData = {
      customerId: conversionDto.customerId,
      prevOrderId: conversionDto.prevOrderId,
      cardId: conversionDto.cardId || conversionDto.creditCardId, // Prioritize cardId over creditCardId
      creditCardId: conversionDto.creditCardId,
      customerCardId: conversionDto.customerCardId,
      customerBillingId: conversionDto.customerBillingId,
      customerAdressBillingId: conversionDto.customerAdressBillingId,
      parentOfferId: conversionDto.parentOfferId,
      mainOfferId: conversionDto.mainOfferId,
      mainProductId: conversionDto.mainProductId,
      stickyCampaignId: conversionDto.stickyCampaignId,
      lastAttribution: conversionDto.lastAttribution,
      offers: offers,
    };

    // Use VRIO service for upsell
    const response = await this.vrioService.processUpsell(upsellData);

    // Comment out Sticky service call
    // const response = await this.stickyService.processNewUpsell(processedData);

    const queueData = this.prepareQueueData(response, conversionDto, upsellData);
    
    if (response?.order_id) {
      await this.jobService.createJob(JobType.UPSELL_SALE, queueData);
    } else {
      await this.jobService.createJob(JobType.FAILED_SALE, queueData);
    }

    return queueData;
  }
 

  private normalizeOffers(offers: any): any[] {
    if (Array.isArray(offers)) {
      return [...offers];
    } else if (offers && typeof offers === 'object') {
      const normalizedOffers: any[] = [];
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

    // Get bump offers filtered by specific bumpOfferId and bumpProductId
    const bumpOffers = allOffers.filter(offer => 
      offer.type === "BUMP" && 
      offer.offerId === convertionlDto.bumpOfferId && 
      offer.productId === convertionlDto.bumpProductId
    );

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
        
        if (response.response_code === "100") {
         
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
        
        if (response.response_code === "100") {
         
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
  
 
  /**
   * Process fields for VRIO API - simplified version without AFID, SID, etc.
   * VRIO uses tracking variables instead of these legacy fields
   */
  private processVrioFields(prospectData: any, conversionDto: ConversionDto) {
    // VRIO doesn't need AFID, SID, C1, C2, C3 fields as per requirements
    // All tracking information is handled through the tracking variables in VRIO service
    
    // Add any additional fields that might be needed for VRIO
    if (conversionDto.deviceInfo?.type) {
      prospectData.device_category = conversionDto.deviceInfo.type;
    }

    if (conversionDto.lastAttribution?._ef_transaction_id) {
      prospectData.click_id = conversionDto.lastAttribution._ef_transaction_id;
    }

    return prospectData;
  }

  private processOtherFields(checkoutData: any, conversionDto: ConversionDto) {
    //filling other info
    if (conversionDto.lastAttribution?.campaign_id) {
      checkoutData.AFFID = conversionDto.lastAttribution.campaign_id;
    }

    if (conversionDto.lastAttribution?.campaign_id) {
      checkoutData.AFID = conversionDto.lastAttribution.campaign_id;
    }

    if (conversionDto.lastAttribution?.h_ad_id) {
      checkoutData.SID = conversionDto.lastAttribution.h_ad_id;
    }

    if (conversionDto.lastAttribution?.h_ad_id) {
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
    } else {
      checkoutData.billingState = 'CA'; // Default state
    }

    if (conversionDto.billingZip) {
      checkoutData.billingZip = conversionDto.billingZip;
    }
    
    if (conversionDto.billingCountry) {
      checkoutData.billingCountry = 'US';//conversionDto.billingCountry;
    }

    // UTM Parameters
    if (conversionDto.lastAttribution?.utm_source) {
      checkoutData.utm_source = conversionDto.lastAttribution.utm_source;
    }

    if (conversionDto.lastAttribution?.utm_medium) {
      checkoutData.utm_medium = conversionDto.lastAttribution.utm_medium;
    }

    if (conversionDto.lastAttribution?.utm_campaign) {
      checkoutData.utm_campaign = conversionDto.lastAttribution.utm_campaign;
    }

    if (conversionDto.lastAttribution?.utm_content) {
      checkoutData.utm_content = conversionDto.lastAttribution.utm_content;
    }

    if (conversionDto.lastAttribution?.utm_term) {
      checkoutData.utm_term = conversionDto.lastAttribution.utm_term;
    }

    // Device Category
    if (conversionDto.deviceInfo?.type) {
      checkoutData.device_category = conversionDto.deviceInfo.type;
    }

    if (conversionDto.lastAttribution?._ef_transaction_id) {
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
    const fields: any[] = [];

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

      const fields: any[] = [];
      
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

      if (parseInt(response.response_code) === 100) {
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

  /**
   * Determine first and last names from available data
   * Priority: firstName/lastName fields, then split cardHolderName
   */
  private determineNames(conversionDto: ConversionDto): { firstName: string; lastName: string } {
    let firstName = '';
    let lastName = '';
    
    // Check if firstName and lastName are available
    if (conversionDto.firstName && conversionDto.lastName) {
      firstName = conversionDto.firstName;
      lastName = conversionDto.lastName;
    } else if (conversionDto.firstName && conversionDto.cardHolderName) {
      // If only firstName is available, use it and split cardHolderName for lastName
      firstName = conversionDto.firstName;
      const nameParts = conversionDto.cardHolderName.trim().split(' ');
      lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
    } else if (conversionDto.lastName && conversionDto.cardHolderName) {
      // If only lastName is available, use it and split cardHolderName for firstName
      lastName = conversionDto.lastName;
      const nameParts = conversionDto.cardHolderName.trim().split(' ');
      firstName = nameParts[0] || '';
    } else if (conversionDto.cardHolderName) {
      // Split cardHolderName if firstName/lastName not available
      const nameParts = conversionDto.cardHolderName.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    return { firstName, lastName };
  }

  
}
