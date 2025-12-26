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
      "Activity limit exceeded"
     /* "This transaction has been declined",
      "Activity limit exceeded",
      "Pick up card - NF",
      "Pick up card - S",
      "Issuer Declined MCC",*/
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
      c2: conversionDto.lastAttribution?.c2 || '',
      c3: conversionDto.lastAttribution?.c3 || '',
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
     conversionDto.offers = offers;
    // Check if offers are empty
    if (!offers || offers.length === 0) {
    
      await this.jobService.createJob(JobType.ERROR,{
        errorMessage : "Missing offers", 
        funnelId : conversionDto?.ftFunnelId, 
        nodeId : conversionDto?.ftNodeId,
        visitorId: conversionDto.visitorId,
        ipAddress: conversionDto.ipAddress,
        accountId: conversionDto.accountId,
        postedPayload: conversionDto
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
        c2: conversionDto.lastAttribution?.c2 || '',
        c3: conversionDto.lastAttribution?.c3 || '',
      };

      const processedProspectData = this.processVrioFields(prospectData, conversionDto);
      const prospectResponse = await this.vrioService.createProspect(processedProspectData);

      if (prospectResponse?.customer_id) {
        // Now proceed with checkout using the created customer
        conversionDto.customerId = prospectResponse.customer_id;
        conversionDto.prevOrderId = prospectResponse.order_id;
        this.logger.log(`Prospect created successfully. Customer ID: ${prospectResponse.customer_id}, Order ID: ${prospectResponse.order_id}`);
        
        // Create SIGNUP job for successful prospect creation (same as processSignup)
        const prospectQueueData = this.prepareQueueData(prospectResponse, conversionDto, processedProspectData);
        if (prospectResponse?.order_id && prospectResponse?.customer_id) {
          await this.jobService.createJob(JobType.SIGNUP, prospectQueueData);
        } else {
          await this.jobService.createJob(JobType.FAILED_SIGNUP, prospectQueueData);
        }
     
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
        c2: conversionDto.lastAttribution?.c2 || '',
        c3: conversionDto.lastAttribution?.c3 || '',
      };

      const processedProspectData = this.processVrioFields(prospectData, conversionDto);
      const prospectResponse = await this.vrioService.createProspect(processedProspectData);

      if (prospectResponse?.customer_id) {
        // Now proceed with checkout using the created customer
        conversionDto.customerId = prospectResponse.customer_id;
        this.logger.log(`Prospect created successfully. Customer ID: ${prospectResponse.customer_id}, using existing Order ID: ${conversionDto.prevOrderId}`);
        
        // Create SIGNUP job for successful prospect creation (same as processSignup)
        const prospectQueueData = this.prepareQueueData(prospectResponse, conversionDto, processedProspectData);
        if (prospectResponse?.order_id && prospectResponse?.customer_id) {
          await this.jobService.createJob(JobType.SIGNUP, prospectQueueData);
        } else {
          await this.jobService.createJob(JobType.FAILED_SIGNUP, prospectQueueData);
        }
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
      

      // Map to VRIO format and use VRIO service for checkout
      const vrioPayload = this.mapToVrioCheckoutFormat(conversionDto);
      const filteredOffers = this.filterOffers(conversionDto);

      // Prepare offers for initial checkout attempt (defensive)
      const initialOffers = [filteredOffers.mainOffer, filteredOffers.bumpOffer].filter(Boolean);
      if (initialOffers.length === 0) {
        const noOfferQueue = this.prepareQueueData({
          error: 'No valid offers found after filtering',
          payment_failed: true
        }, conversionDto, vrioPayload);
        await this.jobService.createJob(JobType.ERROR, noOfferQueue);
        return { error_message: 'Payment failed, please contact support', error_found: '1' };
      }

      // Convert offers to VRIO format
      vrioPayload.offers = this.convertOffersToVrioFormat(initialOffers);

      //this.logger.log('Processing checkout with offers:', vrioPayload.offers);  

      const response = await this.vrioService.processCheckout(conversionDto.prevOrderId.toString(), vrioPayload);

      // Comment out Sticky service call
      // const response = await this.stickyService.processNewOrder(processedData);

      const queueData = this.prepareQueueData(response, conversionDto, vrioPayload);
      
      

      if (response?.order_id) {
        await this.jobService.createJob(JobType.SALE, queueData);
      } else {
        await this.jobService.createJob(JobType.FAILED_SALE, queueData);

        this.logger.log('response 1.', response);
        this.logger.log('fallback offers length 2.',filteredOffers.fallbackOffers.length );
        this.logger.log('should handle fallback 3.', this.shouldHandleFallback(response));
      
        // Check if we should try fallback offers
        if (response && this.shouldHandleFallback(response) && filteredOffers.fallbackOffers.length > 0) {
          this.logger.log(`Main offer failed, trying ${filteredOffers.fallbackOffers.length} fallback offers`);
          
          const fallbackResponse = await this.handleFallbackCheckoutOffers(
            conversionDto, 
            vrioPayload, 
            filteredOffers.fallbackOffers, 
            filteredOffers.bumpOffer
          );
          
          if (fallbackResponse?.order_id) {
            this.logger.log('Fallback offer succeeded');
            const fallbackQueueData = this.prepareQueueData(fallbackResponse, conversionDto, vrioPayload);
            await this.jobService.createJob(JobType.SALE, fallbackQueueData);
            return {
              ...fallbackResponse,
              conversionType: conversionDto.conversionType,
              firstName: firstName,
              lastName: lastName,
              zipCode: conversionDto.billingZip
            };
          } else {
            this.logger.error('All fallback offers failed');
          }
        }
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
        accountId: conversionDto.accountId,
        postedPayload: conversionDto
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
        accountId: conversionDto.accountId,
        postedPayload: conversionDto
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
        accountId: conversionDto.accountId,
        postedPayload: conversionDto
      });
      return { error_message: 'Previous order ID is required for upsell', error_found: "1" };
    }

    this.logger.log('Processing upsell with VRIO');

  
    // Map to VRIO format and use VRIO service for upsell
    const vrioPayload = this.mapToVrioUpsellFormat(conversionDto);

    
    const filteredOffers = this.filterOffers(conversionDto);

    //return conversionDto;
    // Prepare offers for initial upsell attempt (defensive)
    const initialOffers = [filteredOffers.mainOffer, filteredOffers.bumpOffer].filter(Boolean);
    if (initialOffers.length === 0) {
      const noOfferQueue = this.prepareQueueData({
        error: 'No valid upsell offers found after filtering',
        payment_failed: true
      }, conversionDto, vrioPayload);
      await this.jobService.createJob(JobType.ERROR, noOfferQueue);
      return { error_message: 'Payment failed, please contact support', error_found: '1' };
    }

    // Convert offers to VRIO format for upsell
    vrioPayload.offers = this.convertOffersToVrioUpsellFormat(initialOffers, conversionDto);

    const updatedVrioPayload = {
      ...vrioPayload,
     // force_campaign_id: true,
      
    };
    
    this.logger.log('updatedVrioPayload', vrioPayload);
    
    // Use VRIO service for upsell
    const response = await this.vrioService.processUpsell(updatedVrioPayload);

    const queueData = this.prepareQueueData(response, conversionDto, vrioPayload);
    
    if (response?.order_id) {
      await this.jobService.createJob(JobType.UPSELL_SALE, queueData);
    } else {
      await this.jobService.createJob(JobType.FAILED_SALE, queueData);

      // Check if we should try fallback offers for upsell
      if (response && this.shouldHandleFallback(response) && filteredOffers.fallbackOffers.length > 0) {
        this.logger.log(`Main upsell offer failed, trying ${filteredOffers.fallbackOffers.length} fallback offers`);
        
        const fallbackResponse = await this.handleFallbackUpsellOffers(
          conversionDto, 
          vrioPayload, 
          filteredOffers.fallbackOffers, 
          filteredOffers.bumpOffer
        );
        
        if (fallbackResponse?.order_id) {
          this.logger.log('Fallback upsell offer succeeded');
          const fallbackQueueData = this.prepareQueueData(fallbackResponse, conversionDto, vrioPayload);
          await this.jobService.createJob(JobType.UPSELL_SALE, fallbackQueueData);
          return fallbackQueueData;
        } else {
          this.logger.error('All fallback upsell offers failed');
        }
      }
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
    if (!data || !data.error) {
      return false;
    }
    
    const errorMessage = typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error);
    
    return this.failureReasons.some(reason => {
      // For REFID patterns, check if the base pattern matches (before REFID)
      if (reason.includes('REFID:')) {
        const basePattern = reason.split(' REFID:')[0];
        return errorMessage.toLowerCase().includes(basePattern.toLowerCase());
      }
      // For other patterns, use exact match
      return errorMessage.toLowerCase().includes(reason.toLowerCase());
    });
  }

  private async handleFallbackCheckoutOffers(conversionDto: ConversionDto, vrioPayload: any, fallbackOffers: any[], bumpOffer: any): Promise<any> {
    // Try each fallback offer with bump offer if enabled
    for (const fallbackOffer of fallbackOffers) {
      try {
        this.logger.log(`Trying fallback offer with priority ${fallbackOffer.priority}: ${fallbackOffer.productName}`);
        
        // Prepare offers for this fallback attempt
        const offersToTry = [fallbackOffer];
        if (bumpOffer) {
          offersToTry.push(bumpOffer);
        }

        const campaignId = fallbackOffer.campaignId;
        
        // Convert offers to VRIO format
        const vrioOffers = this.convertOffersToVrioFormat(offersToTry);
        
        // Create new VRIO payload with fallback offer
        const fallbackVrioPayload = {
          ...vrioPayload,
          force_campaign_id: true,
          offers_restrict:true,
          campaign_id: campaignId,
          offers: vrioOffers
        };

        const response = await this.vrioService.processCheckout(conversionDto.prevOrderId?.toString() || '', fallbackVrioPayload);
        
        if (response?.order_id) {
          this.logger.log(`Fallback offer successful with priority ${fallbackOffer.priority}`);
          return { 
            ...response, 
            isFallback: true, 
            fallbackPriority: fallbackOffer.priority,
            fallbackProductName: fallbackOffer.productName
          };
        } else {
          // Fallback offer failed - check if we should continue with next fallback
          if (response && this.shouldHandleFallback(response)) {
            this.logger.log(`Fallback offer ${fallbackOffer.priority} failed with recoverable error, trying next fallback`);
            
            // Log FAILED_SALE job for this failed fallback attempt
            const fallbackQueueData = this.prepareQueueData(response, conversionDto, fallbackVrioPayload);
            await this.jobService.createJob(JobType.FAILED_SALE, {
              ...fallbackQueueData,
              isFallback: true,
              fallbackPriority: fallbackOffer.priority,
              fallbackProductName: fallbackOffer.productName
            });
            
            continue; // Try next fallback offer
          } else {
            this.logger.log(`Fallback offer ${fallbackOffer.priority} failed with non-recoverable error, stopping fallback attempts`);
            
            // Log FAILED_SALE job for this failed fallback attempt
            const fallbackQueueData = this.prepareQueueData(response, conversionDto, fallbackVrioPayload);
            await this.jobService.createJob(JobType.FAILED_SALE, {
              ...fallbackQueueData,
              isFallback: true,
              fallbackPriority: fallbackOffer.priority,
              fallbackProductName: fallbackOffer.productName
            });
            
            // Stop trying more fallback offers
            break;
          }
        }
        
      } catch (error) {
        this.logger.error(`Error processing fallback offer with priority ${fallbackOffer.priority}:`, error);
        
        // Log FAILED_SALE job for this failed fallback attempt due to exception
        const errorResponse = {
          error: error.message || 'Unknown error',
          payment_failed: true
        };
        const fallbackQueueData = this.prepareQueueData(errorResponse, conversionDto, vrioPayload);
        await this.jobService.createJob(JobType.FAILED_SALE, {
          ...fallbackQueueData,
          isFallback: true,
          fallbackPriority: fallbackOffer.priority,
          fallbackProductName: fallbackOffer.productName
        });
        
        continue; // Try next fallback offer
      }
    }

    // If all fallback offers failed, return the last error
    this.logger.error('All fallback offers failed');
    return { 
      error_message: 'All fallback offers failed', 
      isFallback: true,
      payment_failed: true
    };
  }

  private async handleFallbackUpsellOffers(conversionDto: ConversionDto, vrioPayload: any, fallbackOffers: any[], bumpOffer: any): Promise<any> {
    // Try each fallback offer with bump offer if enabled
    for (const fallbackOffer of fallbackOffers) {
      try {
        this.logger.log(`Trying fallback upsell offer with priority ${fallbackOffer.priority}: ${fallbackOffer.productName}`);
        
        // Prepare offers for this fallback attempt
        const offersToTry = [fallbackOffer];
        if (bumpOffer) {
          offersToTry.push(bumpOffer);
        }

        const campaignId = fallbackOffer.campaignId;
        
        // Convert offers to VRIO upsell format
        const vrioOffers = this.convertOffersToVrioUpsellFormat(offersToTry, conversionDto);
        
        // Create new VRIO payload with fallback offer
        const fallbackVrioPayload = {
          ...vrioPayload,
          force_campaign_id: true,
          offers_restrict:true,
          campaign_id: campaignId,
          offers: vrioOffers
        };

        
        const response = await this.vrioService.processUpsell(fallbackVrioPayload);
        
        if (response?.order_id) {
          this.logger.log(`Fallback upsell offer successful with priority ${fallbackOffer.priority}`);
          return { 
            ...response, 
            isFallback: true, 
            fallbackPriority: fallbackOffer.priority,
            fallbackProductName: fallbackOffer.productName
          };
        } else {
          // Fallback offer failed - check if we should continue with next fallback
          if (response && this.shouldHandleFallback(response) ) {
            this.logger.log(`Fallback upsell offer ${fallbackOffer.priority} failed with recoverable error, trying next fallback`);
            
            // Log FAILED_SALE job for this failed fallback attempt
            const fallbackQueueData = this.prepareQueueData(response, conversionDto, fallbackVrioPayload);
            await this.jobService.createJob(JobType.FAILED_SALE, {
              ...fallbackQueueData,
              isFallback: true,
              fallbackPriority: fallbackOffer.priority,
              fallbackProductName: fallbackOffer.productName
            });
            
            continue; // Try next fallback offer
          } else {
            this.logger.log(`Fallback upsell offer ${fallbackOffer.priority} failed with non-recoverable error, stopping fallback attempts`);
            
            // Log FAILED_SALE job for this failed fallback attempt
            const fallbackQueueData = this.prepareQueueData(response, conversionDto, fallbackVrioPayload);
            await this.jobService.createJob(JobType.FAILED_SALE, {
              ...fallbackQueueData,
              isFallback: true,
              fallbackPriority: fallbackOffer.priority,
              fallbackProductName: fallbackOffer.productName
            });
            
            // Stop trying more fallback offers
            break;
          }
        }
        
      } catch (error) {
        this.logger.error(`Error processing fallback upsell offer with priority ${fallbackOffer.priority}:`, error);
        
        // Log FAILED_SALE job for this failed fallback attempt due to exception
        const errorResponse = {
          error: error.message || 'Unknown error',
          payment_failed: true
        };
        const fallbackQueueData = this.prepareQueueData(errorResponse, conversionDto, vrioPayload);
        await this.jobService.createJob(JobType.FAILED_SALE, {
          ...fallbackQueueData,
          isFallback: true,
          fallbackPriority: fallbackOffer.priority,
          fallbackProductName: fallbackOffer.productName
        });
        
        continue; // Try next fallback offer
      }
    }

    // If all fallback offers failed, return the last error
    this.logger.error('All fallback upsell offers failed');
    return { 
      error_message: 'All fallback upsell offers failed', 
      isFallback: true,
      payment_failed: true
    };
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
    if (sanitizedCheckoutData.card_number) {
      const cardNumber = sanitizedCheckoutData.card_number.replace(/\s/g, '');
      sanitizedCheckoutData.card_number = cardNumber.length >= 4 
        ? `****${cardNumber.slice(-4)}` 
        : '****';
    }
    
    // Remove sensitive fields from checkout data
    delete sanitizedCheckoutData.card_exp_month;
    delete sanitizedCheckoutData.card_exp_year;
    delete sanitizedCheckoutData.card_cvv;
    
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
   * Map checkout data to VRIO checkout format
   */
  private mapToVrioCheckoutFormat(checkoutData: ConversionDto): any {
    // Determine first and last names using shared logic
    const { firstName, lastName } = this.determineNames(checkoutData);

    const vrioPayload: any = {
      connection_id: 1,
      payment_method_id: 1,
      card_number: checkoutData.creditCardNumber,
      card_type_id: this.getCardTypeId(checkoutData.creditCardNumber || ''),
      card_cvv: checkoutData.cvc,
      card_exp_month: parseInt(checkoutData.creditCardExpiryMonth || ''),
      card_exp_year: parseInt(checkoutData.creditCardExpiryYear || ''),
      customer_id: checkoutData.customerId,
      bill_fname: firstName,
      bill_lname: lastName,
      bill_address1: checkoutData.billingAddress || 'not available',
      bill_city: checkoutData.billingCity || 'not available',
      bill_country: 'US', // Default to US
      bill_state: checkoutData.billingState || 'CA',
      bill_zipcode: checkoutData.billingZip || 'not available',
    };

    // Map shippingProfileId only if it has a value
    if (checkoutData.shippingProfileId) {
      vrioPayload.shipping_profile_id = checkoutData.shippingProfileId;
    }

    // Map offers - only include bump offer if isBump is true
    
    return vrioPayload;
  }

  /**
   * Map upsell data to VRIO upsell format
   */
  private mapToVrioUpsellFormat(conversionDto: ConversionDto): any {
    const vrioPayload: any = {
      connection_id: 1,
      campaign_id: conversionDto.stickyCampaignId || 2,
      customer_id: conversionDto.customerId,
      customers_address_billing_id: conversionDto.customerAdressBillingId || conversionDto.customerBillingId || conversionDto.customerId,
      customer_card_id: conversionDto.cardId || conversionDto.customerCardId || conversionDto.creditCardId,
      action: "process",
      payment_method_id: 1,
    };

    // Map tracking fields from lastAttribution
    if (conversionDto.lastAttribution) {
      const attr = conversionDto.lastAttribution;
      
      // tracking1: utm_campaign
      if (attr.utm_campaign) {
        vrioPayload.tracking1 = attr.utm_campaign;
      }
      
      // tracking2: utm_source
      if (attr.utm_source) {
        vrioPayload.tracking2 = attr.utm_source;
      }
      
      // tracking3: h_ad_id
      if (attr.h_ad_id) {
        vrioPayload.tracking3 = attr.h_ad_id;
      }
      
      // tracking4: adid
      if (attr.adid) {
        vrioPayload.tracking4 = attr.adid;
      }
      
      // tracking5: gc_id
      if (attr.gc_id) {
        vrioPayload.tracking5 = attr.gc_id;
      }
      
      // tracking6: campaign_id
      if (attr.campaign_id) {
        vrioPayload.tracking6 = attr.campaign_id;
      }

      if (conversionDto.lastAttribution?._ef_transaction_id) {
        vrioPayload.tracking12 = conversionDto.lastAttribution._ef_transaction_id;
      }

      if (conversionDto.lastAttribution?.c2) {
        vrioPayload.tracking10 = conversionDto.lastAttribution.c2;
      }

      if (conversionDto.lastAttribution?.c3) {
        vrioPayload.tracking11 = conversionDto.lastAttribution.c3;
      }

    }

    return vrioPayload;
  }

  private filterOffers(checkoutData: any): any {
    let mainOffer: any = null;
    let bumpOffer: any = null;
    let fallbackOffers: any[] = [];
    
    if (checkoutData.offers && checkoutData.offers.length > 0) {
      // Find and process main offer
      mainOffer = checkoutData.offers.find((offer: any) =>
        offer.type === 'MAIN' &&
        offer.offerId === checkoutData.mainOfferId &&
        offer.productId === checkoutData.mainProductId
      );

      // Extract fallback offers from the main offer
      if (mainOffer && mainOffer.fallbackOffers && Array.isArray(mainOffer.fallbackOffers)) {
        fallbackOffers = mainOffer.fallbackOffers
          .filter((fallback: any) => !fallback.isArchived)
          .sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999));
      }
     
      // Process bump offer if enabled
      const isBumpEnabled = checkoutData.isBump === '1' || 
                            checkoutData.isBump === true || 
                            checkoutData.isBump === 1;
  
      if (isBumpEnabled) {
        bumpOffer = checkoutData.offers.find((offer: any) =>
          offer.type === 'BUMP' &&
          offer.offerId === checkoutData.bumpOfferId &&
          offer.productId === checkoutData.bumpProductId
        );
      }
    }
  
    return {
      mainOffer: mainOffer,
      bumpOffer: bumpOffer,
      fallbackOffers: fallbackOffers
    };
  }

  /**
   * Convert offers to VRIO API format
   */
  private convertOffersToVrioFormat(offers: any[]): any[] {
    return offers
      .filter(offer => offer && offer.offerId != null && offer.productId != null)
      .map(offer => ({
        offer_id: parseInt(offer.offerId?.toString()),
        order_offer_quantity: offer.quantity || 1,
        item_id: parseInt(offer.productId?.toString())
      }));
  }

  /**
   * Convert offers to VRIO upsell format
   */
  private convertOffersToVrioUpsellFormat(offers: any[], conversionDto: ConversionDto): any[] {
    return offers
      .filter(offer => offer && offer.offerId != null && offer.productId != null)
      .map(offer => ({
        offer_id: parseInt(offer.offerId?.toString()),
        order_offer_quantity: offer.quantity || 1,
        item_id: parseInt(offer.productId?.toString()),
        order_offer_upsell: true,
        parent_offer_id: conversionDto.parentOfferId,
        parent_order_id: conversionDto.prevOrderId,
        
      }));
  }

  /**
   * Get card type ID for VRIO
   * 1 - Mastercard
   * 2 - Visa
   * 3 - Discover
   * 4 - American Express
   * 5 - Digital Wallet
   * 6 - ACH
   */
  private getCardTypeId(cardNumber: string): number {
    const cardType = this.getCardType(cardNumber);
    const cardTypeMap = {
      'master': 1,      // Mastercard
      'visa': 2,        // Visa
      'discover': 3,    // Discover
      'amex': 4,        // American Express
      'digital_wallet': 5, // Digital Wallet
      'ach': 6,         // ACH
      'unknown': 2      // Default to Visa
    };
    return cardTypeMap[cardType] || 2;
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

  async processUpsellByEmail5(email: string, offerId: string, productId: string): Promise<any> {
    this.logger.log(`Processing upsell by email: ${email}, offerId: ${offerId}, productId: ${productId}`);

    // Fetch customer and last order from VRIO API
    const { customer, lastOrder } = await this.vrioService.getCustomerAndLastOrderByEmail(email);
    
    return lastOrder;
  }
  async processUpsellByEmail(email: string, offerId: string, productId: string): Promise<any> {
    this.logger.log(`Processing upsell by email: ${email}, offerId: ${offerId}, productId: ${productId}`);

    // Fetch customer and last order from VRIO API
    const { customer, lastOrder } = await this.vrioService.getCustomerAndLastOrderByEmail(email);
    
    
    if (!lastOrder || !lastOrder.order_id) {
      await this.jobService.createJob(JobType.ERROR, {
        errorMessage: `No order found for email: ${email}`,
        email,
        offerId,
        productId
      });
      return {
        errorMessage: `No order found for email: ${email}`,
        email,
        offerId,
        productId
      };
    }

    
    if (!lastOrder.customer_id) {
      await this.jobService.createJob(JobType.ERROR, {
        errorMessage: `No customer ID found in order for email: ${email}`,
        email,
        offerId,
        productId,
        orderId: lastOrder.order_id
      });
      return { error_message: 'Invalid order data: missing customer ID', error_found: "1" };
    }

    // Extract required fields from the last order
    const customerId = lastOrder.customer_id;
    const prevOrderId = lastOrder.order_id;
    const cardId = lastOrder.customer_card_id;
    const customerBillingId = lastOrder.customers_address_billing_id || customerId;
    const stickyCampaignId = 7;
    
    // Extract parent offer ID from the last order's offers
    let parentOfferId: number | undefined;
    if (lastOrder.order_offers && Array.isArray(lastOrder.order_offers) && lastOrder.order_offers.length > 0) {
      // Get the first main offer (non-upsell) as parent
      const mainOffer = lastOrder.order_offers.find((offer: any) => !offer.order_offer_upsell);
      if (mainOffer?.offer_id) {
        parentOfferId = mainOffer.offer_id;
      } else if (lastOrder.order_offers[0]?.offer_id) {
        // Fallback to first offer if no main offer found
        parentOfferId = lastOrder.order_offers[0].offer_id;
      }
    }

    // Validate required fields
    if (!customerId) {
      await this.jobService.createJob(JobType.ERROR, {
        errorMessage: `Missing customerId for email: ${email}`,
        email,
        offerId,
        productId
      });
      return { error_message: 'Invalid customer data: missing customer ID', error_found: "1" };
    }

    if (!prevOrderId) {
      await this.jobService.createJob(JobType.ERROR, {
        errorMessage: `Missing orderId for email: ${email}`,
        email,
        offerId,
        productId
      });
      return { error_message: 'Invalid order data: missing order ID', error_found: "1" };
    }

    // Extract tracking/attribution from last order
    const lastAttribution: any = {};
    if (lastOrder.tracking1) lastAttribution.utm_campaign = lastOrder.tracking1;
    if (lastOrder.tracking2) lastAttribution.utm_source = lastOrder.tracking2;
    if (lastOrder.tracking3) lastAttribution.h_ad_id = lastOrder.tracking3;
    if (lastOrder.tracking4) lastAttribution.adid = lastOrder.tracking4;
    if (lastOrder.tracking5) lastAttribution.gc_id = lastOrder.tracking5;
    if (lastOrder.tracking6) lastAttribution.campaign_id = lastOrder.tracking6;
    if (lastOrder.tracking12) lastAttribution._ef_transaction_id = lastOrder.tracking12;
    if (lastOrder.tracking10) lastAttribution.c2 = lastOrder.tracking10;
    if (lastOrder.tracking11) lastAttribution.c3 = lastOrder.tracking11;

    // Construct ConversionDto for upsell
    const conversionDto: ConversionDto = {
      conversionType: ConversionType.UPSELL,
      email: email,
      customerId: customerId,
      prevOrderId: prevOrderId,
      cardId: cardId,
      creditCardId: cardId,
      customerCardId: cardId,
      customerBillingId: customerBillingId,
      customerAdressBillingId: customerBillingId,
      parentOfferId: parentOfferId,
      mainOfferId: offerId,
      mainProductId: productId,
      stickyCampaignId: stickyCampaignId,
      offers: [{
        type: 'MAIN',
        offerId: offerId,
        productId: productId,
        quantity: 1
      }],
      lastAttribution: lastAttribution,
      ipAddress: lastOrder.ip_address
    } as ConversionDto;

    // Process the upsell using existing method
    return await this.processUpsell(conversionDto);
  }

  
}
