import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as https from 'https';

// Define interfaces for VRIO API responses
export interface VrioApiResponse {
  order_id?: number;
  campaign_id?: number;
  status_type_id?: number | null;
  customer_card_id?: number | null;
  customer_id?: number;
  customers_address_billing_id?: number | null;
  customers_address_shipping_id?: number | null;
  date_created?: string;
  date_modified?: string;
  date_ordered?: string | null;
  is_test?: boolean;
  ip_address?: string;
  order_discount?: string;
  order_pixel?: boolean;
  cart_token?: string;
  order_pixel_block?: any;
  order_notes?: string;
  created_by?: number;
  modified_by?: number;
  tracking1?: string | null;
  tracking2?: string | null;
  tracking3?: string | null;
  tracking4?: string | null;
  tracking5?: string | null;
  tracking6?: string | null;
  tracking7?: string | null;
  tracking8?: string | null;
  tracking9?: string | null;
  tracking10?: string | null;
  tracking11?: string | null;
  tracking12?: string | null;
  tracking13?: string | null;
  tracking14?: string | null;
  tracking15?: string | null;
  tracking16?: string | null;
  tracking17?: string | null;
  tracking18?: string | null;
  tracking19?: string | null;
  tracking20?: string | null;
  user_agent?: string | null;
  order_offers?: any[];
  customer_card?: any;
  // Error fields
  error?: string;
  message?: string;
  // Generic catch-all for any other fields
  [key: string]: any;
}

@Injectable()
export class VrioService {
  private readonly logger = new Logger(VrioService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('VRIO_API_URL') || '';
    this.apiKey = this.configService.get<string>('VRIO_API_KEY') || '';
    
    this.logger.log(`VRIO API URL: ${this.apiUrl}`);
    this.logger.log(`VRIO API Key configured: ${!!this.apiKey}`);
    
    if (!this.apiUrl || !this.apiKey) {
      this.logger.error('VRIO API credentials not fully configured');
      this.logger.error(`API URL: ${this.apiUrl}`);
      this.logger.error(`API Key present: ${!!this.apiKey}`);
    }
  }

  private getAuthConfig() {
    if (!this.apiKey) {
      throw new Error('VRIO_API_KEY is not configured');
    }
    
    return {
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000, // 30 second timeout
    };
  }

  /**
   * Create a prospect in VRIO CRM
   * Maps tracking variables according to VRIO's tracking variable mapping
   */
  async createProspect(prospectData: any): Promise<VrioApiResponse | null> {
    // Use the correct endpoint format: VRIO_API_URL + "/orders"
    const apiUrl = `${this.apiUrl}/orders`;
    console.log('apiUrl', apiUrl);
    try {
      this.logger.log(`Creating prospect in VRIO for email: ${prospectData.email || 'unknown'}`);
      
      // Validate required fields
      if (!prospectData.email) {
        throw new Error('Email is required for VRIO prospect creation');
      }
      
      // Map the data to VRIO format
      const vrioPayload = this.mapToVrioFormat(prospectData);
      
      this.logger.log(`VRIO payload:`, JSON.stringify(vrioPayload, null, 2));
      this.logger.log(`VRIO API URL:`, apiUrl);
      this.logger.log(`VRIO API Key configured:`, !!this.apiKey);
      this.logger.log(`VRIO API Key (first 10 chars):`, this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET');
      
      const authConfig = this.getAuthConfig();
      this.logger.log(`Auth config headers:`, authConfig.headers);
      this.logger.log(`Full request config:`, {
        url: apiUrl,
        method: 'POST',
        headers: authConfig.headers,
        data: vrioPayload
      });
      
      let response: AxiosResponse<VrioApiResponse>;
      try {
        response = await firstValueFrom(
          this.httpService.post<VrioApiResponse>(apiUrl, vrioPayload, authConfig)
        );
      } catch (httpError) {
        this.logger.error('HTTP Request failed:', httpError);
        this.logger.error('HTTP Error response:', httpError.response);
        this.logger.error('HTTP Error status:', httpError.response?.status);
        this.logger.error('HTTP Error data:', httpError.response?.data);
        throw httpError; // Re-throw to be caught by outer catch block
      }

      this.logger.log(`VRIO API Response Status: ${response.status}`);
      this.logger.log(`VRIO API Response Data:`, JSON.stringify(response.data, null, 2));

      // Check for successful response - VRIO returns order_id on success
      if (response.data.order_id && response.status >= 200 && response.status < 300) {
        this.logger.log(`VRIO prospect creation successful - Order ID: ${response.data.order_id}, Customer ID: ${response.data.customer_id}`);
        return response.data;
      } else {
        this.logger.warn(`VRIO prospect creation failed: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.logger.error('Full error object:', error);
      this.logger.error('Error response:', error.response);
      this.logger.error('Error response data:', error.response?.data);
      this.logger.error('Error message:', error.message);
      
      // Better error message extraction
      let errorMessage = 'Unknown error';
      
      if (error.response?.data) {
        this.logger.error('Response data type:', typeof error.response.data);
        this.logger.error('Response data stringified:', JSON.stringify(error.response.data));
        
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.errors) {
          errorMessage = Array.isArray(error.response.data.errors) 
            ? error.response.data.errors.join(', ') 
            : JSON.stringify(error.response.data.errors);
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      this.logger.error('Final error message:', errorMessage);
      
      throw new HttpException(
        `Failed to create prospect in VRIO: ${errorMessage}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Map prospect data to VRIO format
   * Based on the tracking variable mapping provided in the image:
   * tracking1: utm_campaign
   * tracking2: utm_source  
   * tracking3: h_ad_id
   * tracking4: adid
   * tracking5: gc_id
   * tracking6: campaign_id
   * tracking7: utm_content
   * tracking8: utm_medium
   * tracking9: reason_for_buying
   * tracking10: (empty in mapping)
   */
  private mapToVrioFormat(prospectData: any): any {
    const vrioPayload: any = {
      cart_token: this.generateCartToken(),
      connection_id: 1, // Default connection ID
      campaign_id: parseInt(prospectData.campaignId || prospectData.stickyCampaignId || 2),
      email: prospectData.email,
    };

    // Map tracking variables based on lastAttribution data
    if (prospectData.lastAttribution) {
      const attr = prospectData.lastAttribution;
      
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
      
      // tracking7: utm_content
      if (attr.utm_content) {
        vrioPayload.tracking7 = attr.utm_content;
      }
      
      // tracking8: utm_medium
      if (attr.utm_medium) {
        vrioPayload.tracking8 = attr.utm_medium;
      }
    }

    // tracking9: reason_for_buying
    if (prospectData.reasonForBuying) {
      vrioPayload.tracking9 = prospectData.reasonForBuying;
    }

    // Add additional fields if available, use "not available" for missing fields
    vrioPayload.first_name = prospectData.firstName || 'not available';
    vrioPayload.last_name = prospectData.lastName || 'not available';
    vrioPayload.phone = prospectData.phone || 'not available';
    vrioPayload.city = prospectData.city || 'not available';
    vrioPayload.state = prospectData.state || 'CA';
    vrioPayload.zip = prospectData.zip || 'not available';
    vrioPayload.address1 = prospectData.address1 || 'not available';
    vrioPayload.ip_address = prospectData.ipAddress || '127.0.0.1';

    return vrioPayload;
  }

  /**
   * Process checkout for existing customer in VRIO
   */
  async processCheckout(checkoutData: any): Promise<VrioApiResponse | null> {
    const apiUrl = `${this.apiUrl}/orders/${checkoutData.prevOrderId}/process`;
    console.log('VRIO checkout apiUrl', apiUrl);

    try {
      this.logger.log(`Processing checkout in VRIO for order: ${checkoutData.prevOrderId}`);
      
      // Validate required fields
      if (!checkoutData.prevOrderId) {
        throw new Error('Previous order ID is required for VRIO checkout');
      }
      
      if (!checkoutData.customerId) {
        throw new Error('Customer ID is required for VRIO checkout');
      }
      
      // Map the data to VRIO checkout format
      const vrioPayload = this.mapToVrioCheckoutFormat(checkoutData);
      
      this.logger.log(`VRIO checkout payload:`, JSON.stringify(vrioPayload, null, 2));
      this.logger.log(`VRIO checkout API URL:`, apiUrl);
      this.logger.log(`VRIO API Key configured:`, !!this.apiKey);
      this.logger.log(`VRIO API Key (first 10 chars):`, this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET');
      
      const authConfig = this.getAuthConfig();
      this.logger.log(`Auth config headers:`, authConfig.headers);
      this.logger.log(`Full checkout request config:`, {
        url: apiUrl,
        method: 'POST',
        headers: authConfig.headers,
        data: vrioPayload
      });
      
      let response: AxiosResponse<VrioApiResponse>;
      try {
        response = await firstValueFrom(
          this.httpService.post<VrioApiResponse>(apiUrl, vrioPayload, authConfig)
        );
      } catch (httpError) {
        this.logger.error('HTTP Request failed:', httpError);
        this.logger.error('HTTP Error response:', httpError.response);
        this.logger.error('HTTP Error status:', httpError.response?.status);
        this.logger.error('HTTP Error data:', httpError.response?.data);
        throw httpError; // Re-throw to be caught by outer catch block
      }

      this.logger.log(`VRIO checkout API Response Status: ${response.status}`);
      this.logger.log(`VRIO checkout API Response Data:`, JSON.stringify(response.data, null, 2));

      // Check for successful response - VRIO returns order_id on success
      if (response.data.order_id && response.status >= 200 && response.status < 300) {
        this.logger.log(`VRIO checkout successful - Order ID: ${response.data.order_id}, Customer ID: ${response.data.customer_id}`);
        return response.data;
      } else {
        this.logger.warn(`VRIO checkout failed: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.logger.error('Full error object:', error);
      this.logger.error('Error response:', error.response);
      this.logger.error('Error response data:', error.response?.data);
      this.logger.error('Error message:', error.message);
      
      // Better error message extraction
      let errorMessage = 'Unknown error';
      
      if (error.response?.data) {
        this.logger.error('Response data type:', typeof error.response.data);
        this.logger.error('Response data stringified:', JSON.stringify(error.response.data));
        
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.errors) {
          errorMessage = Array.isArray(error.response.data.errors) 
            ? error.response.data.errors.join(', ') 
            : JSON.stringify(error.response.data.errors);
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      this.logger.error('Final error message:', errorMessage);
      
      throw new HttpException(
        `Failed to process checkout in VRIO: ${errorMessage}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Map checkout data to VRIO checkout format
   */
  private mapToVrioCheckoutFormat(checkoutData: any): any {
    // Determine first and last names
    let firstName = 'not available';
    let lastName = 'not available';
    
    // Check if firstName and lastName are available
    if (checkoutData.firstName && checkoutData.lastName) {
      firstName = checkoutData.firstName;
      lastName = checkoutData.lastName;
    } else if (checkoutData.firstName && checkoutData.cardHolderName) {
      // If only firstName is available, use it and split cardHolderName for lastName
      firstName = checkoutData.firstName;
      const nameParts = checkoutData.cardHolderName.trim().split(' ');
      lastName = nameParts.slice(1).join(' ') || nameParts[0] || 'not available';
    } else if (checkoutData.lastName && checkoutData.cardHolderName) {
      // If only lastName is available, use it and split cardHolderName for firstName
      lastName = checkoutData.lastName;
      const nameParts = checkoutData.cardHolderName.trim().split(' ');
      firstName = nameParts[0] || 'not available';
    } else if (checkoutData.cardHolderName) {
      // Split cardHolderName if firstName/lastName not available
      const nameParts = checkoutData.cardHolderName.trim().split(' ');
      firstName = nameParts[0] || 'not available';
      lastName = nameParts.slice(1).join(' ') || 'not available';
    }

    const vrioPayload: any = {
      connection_id: 1,
      payment_method_id: 1,
      card_number: checkoutData.creditCardNumber,
      card_type_id: this.getCardTypeId(checkoutData.creditCardNumber),
      card_cvv: checkoutData.cvc,
      card_exp_month: parseInt(checkoutData.creditCardExpiryMonth),
      card_exp_year: parseInt(checkoutData.creditCardExpiryYear),
      customer_id: checkoutData.customerId,
      bill_fname: firstName,
      bill_lname: lastName,
      bill_address1: checkoutData.billingAddress || 'not available',
      bill_city: checkoutData.billingCity || 'not available',
      bill_country: 'US', // Default to US
      bill_state: checkoutData.billingState || 'CA',
      bill_zipcode: checkoutData.billingZip || 'not available',
    };

    // Map offers - only include bump offer if isBump is true
    const offers: any[] = [];
    
    // Always include main offer
    if (checkoutData.offers && checkoutData.offers.length > 0) {
      const mainOffer = checkoutData.offers.find(offer => offer.type === 'MAIN');
      if (mainOffer) {
        offers.push({
          offer_id: parseInt(mainOffer.offerId),
          order_offer_quantity: mainOffer.quantity || 1,
          item_id: parseInt(mainOffer.productId)
        });
      }
      
      // Only include bump offer if isBump is true
      if (checkoutData.isBump === '1' || checkoutData.isBump === true) {
        const bumpOffer = checkoutData.offers.find(offer => offer.type === 'BUMP');
        if (bumpOffer) {
          offers.push({
            offer_id: parseInt(bumpOffer.offerId),
            order_offer_quantity: bumpOffer.quantity || 1,
            item_id: parseInt(bumpOffer.productId)
          });
        }
      }
    }
    
    vrioPayload.offers = offers;

    return vrioPayload;
  }

  /**
   * Get card type ID for VRIO
   */
  private getCardTypeId(cardNumber: string): number {
    const cardType = this.getCardType(cardNumber);
    const cardTypeMap = {
      'visa': 1,
      'master': 2,
      'amex': 3,
      'discover': 4,
      'unknown': 1 // Default to Visa
    };
    return cardTypeMap[cardType] || 1;
  }

  /**
   * Get card type from card number
   */
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

  /**
   * Process upsell in VRIO
   */
  async processUpsell(upsellData: any): Promise<VrioApiResponse | null> {
    const apiUrl = `${this.apiUrl}/orders`;
    console.log('VRIO upsell apiUrl', apiUrl);

    try {
      this.logger.log(`Processing upsell in VRIO for customer: ${upsellData.customerId}`);
      
      // Validate required fields
      if (!upsellData.customerId) {
        throw new Error('Customer ID is required for VRIO upsell');
      }
      
      if (!upsellData.prevOrderId) {
        throw new Error('Previous order ID is required for VRIO upsell');
      }
      
      // Map the data to VRIO upsell format
      const vrioPayload = this.mapToVrioUpsellFormat(upsellData);
      
      this.logger.log(`VRIO upsell payload:`, JSON.stringify(vrioPayload, null, 2));
      this.logger.log(`VRIO upsell API URL:`, apiUrl);
      this.logger.log(`VRIO API Key configured:`, !!this.apiKey);
      this.logger.log(`VRIO API Key (first 10 chars):`, this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET');
      
      const authConfig = this.getAuthConfig();
      this.logger.log(`Auth config headers:`, authConfig.headers);
      this.logger.log(`Full upsell request config:`, {
        url: apiUrl,
        method: 'POST',
        headers: authConfig.headers,
        data: vrioPayload
      });
      
      let response: AxiosResponse<VrioApiResponse>;
      try {
        response = await firstValueFrom(
          this.httpService.post<VrioApiResponse>(apiUrl, vrioPayload, authConfig)
        );
      } catch (httpError) {
        this.logger.error('HTTP Request failed:', httpError);
        this.logger.error('HTTP Error response:', httpError.response);
        this.logger.error('HTTP Error status:', httpError.response?.status);
        this.logger.error('HTTP Error data:', httpError.response?.data);
        throw httpError; // Re-throw to be caught by outer catch block
      }

      this.logger.log(`VRIO upsell API Response Status: ${response.status}`);
      this.logger.log(`VRIO upsell API Response Data:`, JSON.stringify(response.data, null, 2));

      // Check for successful response - VRIO returns order_id on success
      if (response.data.order_id && response.status >= 200 && response.status < 300) {
        this.logger.log(`VRIO upsell successful - Order ID: ${response.data.order_id}, Customer ID: ${response.data.customer_id}`);
        return response.data;
      } else {
        this.logger.warn(`VRIO upsell failed: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.logger.error('Full error object:', error);
      this.logger.error('Error response:', error.response);
      this.logger.error('Error response data:', error.response?.data);
      this.logger.error('Error message:', error.message);
      
      // Better error message extraction
      let errorMessage = 'Unknown error';
      
      if (error.response?.data) {
        this.logger.error('Response data type:', typeof error.response.data);
        this.logger.error('Response data stringified:', JSON.stringify(error.response.data));
        
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.errors) {
          errorMessage = Array.isArray(error.response.data.errors) 
            ? error.response.data.errors.join(', ') 
            : JSON.stringify(error.response.data.errors);
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      this.logger.error('Final error message:', errorMessage);
      
      throw new HttpException(
        `Failed to process upsell in VRIO: ${errorMessage}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Map upsell data to VRIO upsell format
   */
  private mapToVrioUpsellFormat(upsellData: any): any {
    const vrioPayload: any = {
      connection_id: 1,
      campaign_id: upsellData.stickyCampaignId || 2,
      customer_id: upsellData.customerId,
      customers_address_billing_id: upsellData.customerBillingId || upsellData.customerId,
      customer_card_id: upsellData.cardId || upsellData.customerCardId || upsellData.creditCardId,
      action: "process",
      payment_method_id: 1,
    };

    // Map offers - find the main offer for upsell
    const offers: any[] = [];
    
    if (upsellData.offers && upsellData.offers.length > 0) {
      // Find the main offer based on mainOfferId and mainProductId
      const mainOffer = upsellData.offers.find(offer => 
        offer.offerId == upsellData.mainOfferId && 
        offer.productId == upsellData.mainProductId &&
        offer.type === 'MAIN'
      );
      
      if (mainOffer) {
        offers.push({
          offer_id: parseInt(mainOffer.offerId),
          order_offer_quantity: mainOffer.quantity || 1,
          order_offer_upsell: true,
          parent_order_id: upsellData.prevOrderId,
          item_id: parseInt(mainOffer.productId),
          parent_offer_id: upsellData.parentOfferId || 6 // Default parent offer ID
        });
      } else {
        // Fallback: use the first MAIN offer if specific main offer not found
        const fallbackMainOffer = upsellData.offers.find(offer => offer.type === 'MAIN');
        if (fallbackMainOffer) {
          offers.push({
            offer_id: parseInt(fallbackMainOffer.offerId),
            order_offer_quantity: fallbackMainOffer.quantity || 1,
            order_offer_upsell: true,
            parent_order_id: upsellData.prevOrderId,
            item_id: parseInt(fallbackMainOffer.productId),
            parent_offer_id: upsellData.parentOfferId || 6
          });
        }
      }
    }
    
    vrioPayload.offers = offers;

    return vrioPayload;
  }

  /**
   * Test VRIO API connection and available endpoints
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      this.logger.log('Testing VRIO API connection...');
      
      if (!this.apiUrl || !this.apiKey) {
        return {
          success: false,
          message: 'VRIO API credentials not configured',
          details: {
            apiUrl: this.apiUrl,
            apiKeyConfigured: !!this.apiKey
          }
        };
      }

      // Test the correct endpoint format
      const endpoints = [
        '/orders'  // This should be the correct endpoint: VRIO_API_URL + "/orders"
      ];

      const testResults: any[] = [];

      for (const endpoint of endpoints) {
        try {
          const testPayload = {
            cart_token: this.generateCartToken(),
            connection_id: 1,
            campaign_id: 2,
            email: 'test@example.com'
          };

          this.logger.log(`Testing endpoint: ${this.apiUrl}${endpoint}`);

          const response = await firstValueFrom(
            this.httpService.post(`${this.apiUrl}${endpoint}`, testPayload, this.getAuthConfig())
          );

          testResults.push({
            endpoint,
            success: true,
            status: response.status,
            data: response.data
          });

        } catch (error) {
          testResults.push({
            endpoint,
            success: false,
            error: error.response?.data || error.message,
            status: error.response?.status
          });
        }
      }

      return {
        success: true,
        message: 'VRIO API endpoint test completed',
        details: {
          apiUrl: this.apiUrl,
          apiKeyConfigured: !!this.apiKey,
          testResults
        }
      };

    } catch (error) {
      this.logger.error('VRIO connection test failed:', error);
      
      return {
        success: false,
        message: 'VRIO API connection failed',
        details: {
          error: error.message,
          response: error.response?.data,
          status: error.response?.status
        }
      };
    }
  }

  /**
   * Update customer information in VRIO
   */
  async updateCustomer(customerId: number, customerData: { firstName?: string; lastName?: string }): Promise<VrioApiResponse | null> {
    const apiUrl = `${this.apiUrl}/customers/${customerId}`;
    console.log('VRIO update customer apiUrl', apiUrl);

    try {
      this.logger.log(`Updating customer in VRIO for customer ID: ${customerId}`);
      
      // Validate required fields
      if (!customerId) {
        throw new Error('Customer ID is required for VRIO customer update');
      }
      
      // Prepare the payload
      const vrioPayload: any = {};
      
      if (customerData.firstName) {
        vrioPayload.first_name = customerData.firstName;
      }
      
      if (customerData.lastName) {
        vrioPayload.last_name = customerData.lastName;
      }
      
      // If no data to update, return early
      if (Object.keys(vrioPayload).length === 0) {
        this.logger.log('No customer data to update');
        return null;
      }
      
      this.logger.log(`VRIO update customer payload:`, JSON.stringify(vrioPayload, null, 2));
      this.logger.log(`VRIO update customer API URL:`, apiUrl);
      this.logger.log(`VRIO API Key configured:`, !!this.apiKey);
      this.logger.log(`VRIO API Key (first 10 chars):`, this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT SET');
      
      const authConfig = this.getAuthConfig();
      this.logger.log(`Auth config headers:`, authConfig.headers);
      this.logger.log(`Full update customer request config:`, {
        url: apiUrl,
        method: 'PATCH',
        headers: authConfig.headers,
        data: vrioPayload
      });
      
      let response: AxiosResponse<VrioApiResponse>;
      try {
        response = await firstValueFrom(
          this.httpService.patch<VrioApiResponse>(apiUrl, vrioPayload, authConfig)
        );
      } catch (httpError) {
        this.logger.error('HTTP Request failed:', httpError);
        this.logger.error('HTTP Error response:', httpError.response);
        this.logger.error('HTTP Error status:', httpError.response?.status);
        this.logger.error('HTTP Error data:', httpError.response?.data);
        throw httpError; // Re-throw to be caught by outer catch block
      }

      this.logger.log(`VRIO update customer API Response Status: ${response.status}`);
      this.logger.log(`VRIO update customer API Response Data:`, JSON.stringify(response.data, null, 2));

      // Check for successful response
      if (response.status >= 200 && response.status < 300) {
        this.logger.log(`VRIO customer update successful for customer ID: ${customerId}`);
        return response.data;
      } else {
        this.logger.warn(`VRIO customer update failed: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.logger.error('Full error object:', error);
      this.logger.error('Error response:', error.response);
      this.logger.error('Error response data:', error.response?.data);
      this.logger.error('Error message:', error.message);
      
      // Better error message extraction
      let errorMessage = 'Unknown error';
      
      if (error.response?.data) {
        this.logger.error('Response data type:', typeof error.response.data);
        this.logger.error('Response data stringified:', JSON.stringify(error.response.data));
        
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.errors) {
          errorMessage = Array.isArray(error.response.data.errors) 
            ? error.response.data.errors.join(', ') 
            : JSON.stringify(error.response.data.errors);
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      this.logger.error('Final error message:', errorMessage);
      
      throw new HttpException(
        `Failed to update customer in VRIO: ${errorMessage}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Generate a unique cart token for VRIO
   */
  private generateCartToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
