import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as https from 'https';

// Define interfaces for better type safety
interface ProspectInfo {
  first_name?: string;
  last_name?: string;
  affiliate?: string;
  sub_affiliate?: string;
  custom_fields?: { name: string; values: { value: string }[] }[];
  prospect_id?: string;
}

export interface StickyApiResponse {
  response_code: string;
  error_found?: string;
  resp_msg?: string;
  // Order-specific fields
  gateway_id?: string;
  order_id?: string;
  transactionID?: string;
  customerId?: string;
  authId?: string;
  orderTotal?: string;
  orderSalesTaxPercent?: string;
  orderSalesTaxAmount?: string;
  test?: string;
  prepaid_match?: string;
  gatewayCustomerService?: string;
  gatewayDescriptor?: string;
  subscription_id?: { [key: string]: string };
  // Prospect-specific fields
  prospectId?: number;
  // Generic catch-all for any other fields
  [key: string]: any;
}

@Injectable()
export class StickyService {
  private readonly logger = new Logger(StickyService.name);
  private readonly apiUrl: string;
  private readonly username: string;
  private readonly password: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('STICKY_API_URL') || '';
    this.username = this.configService.get<string>('STICKY_USERNAME') || '';
    this.password = this.configService.get<string>('STICKY_PASSWORD') || '';
    
    if (!this.apiUrl || !this.username || !this.password) {
      this.logger.warn('Sticky API credentials not fully configured');
    }
  }

  private getAuthConfig() {
    return {
      auth: {
        username: this.username,
        password: this.password
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000, // 30 second timeout
    };
  }

  async updateProspect(prospectData: any): Promise<StickyApiResponse> {
    const apiUrl = `${this.apiUrl}/api/v1/prospect_update`;

    try {
      this.logger.log(`Updating prospect: ${prospectData.prospect_id || 'unknown'}`);
      
      const response = await lastValueFrom(
        this.httpService.post<StickyApiResponse>(apiUrl, prospectData, this.getAuthConfig())
      );

      this.logger.log(`Prospect update successful: ${response.data.response_code}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error updating prospect:', error.response?.data || error.message);
      throw new HttpException(
        `Failed to update prospect: ${error.response?.data?.resp_msg || error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async processNewOrder(orderData: any): Promise<StickyApiResponse> {
    const apiUrl = `${this.apiUrl}/api/v1/new_order`;
    
    try {
      this.logger.log(`Processing new order for campaign: ${orderData.campaignId || 'unknown'}`);
      
      const response = await lastValueFrom(
        this.httpService.post<StickyApiResponse>(apiUrl, orderData, this.getAuthConfig())
      );

      this.logger.log(`Order processing result: ${response.data.response_code} - ${response.data.resp_msg || ''}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error processing new order:', error.response?.data || error.message);
      throw new HttpException(
        `Failed to process new order: ${error.response?.data?.resp_msg || error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async processNewUpsell(upsellData: any): Promise<StickyApiResponse> {
    const apiUrl = `${this.apiUrl}/api/v1/new_upsell`;

    try {
      this.logger.log(`Processing new upsell for order: ${upsellData.previousOrderId || 'unknown'}`);
      
      const response = await lastValueFrom(
        this.httpService.post<StickyApiResponse>(apiUrl, upsellData, this.getAuthConfig())
      );

      this.logger.log(`Upsell processing result: ${response.data.response_code} - ${response.data.resp_msg || ''}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error processing new upsell:', error.response?.data || error.message);
      throw new HttpException(
        `Failed to process new upsell: ${error.response?.data?.resp_msg || error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getCampaignView(campaignId: number): Promise<StickyApiResponse> {
    const apiUrl = `${this.apiUrl}/api/v1/campaign_view`;
    const data = { campaign_id: campaignId };

    try {
      this.logger.log(`Fetching campaign view for ID: ${campaignId}`);
      
      const response = await lastValueFrom(
        this.httpService.post<StickyApiResponse>(apiUrl, data, this.getAuthConfig())
      );

      this.logger.log(`Campaign view fetched successfully: ${response.data.response_code}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching campaign view:', error.response?.data || error.message);
      throw new HttpException(
        `Failed to fetch campaign view: ${error.response?.data?.resp_msg || error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async findOrCreateProspect(processedData: any): Promise<StickyApiResponse | null> {
    const apiUrl = `${this.apiUrl}/api/v1/new_prospect`;

    try {
      this.logger.log(`Finding/creating prospect for email: ${processedData.email || 'unknown'}`);
      
      const response: AxiosResponse<StickyApiResponse> = await firstValueFrom(
        this.httpService.post<StickyApiResponse>(apiUrl, processedData, this.getAuthConfig())
      );

      if (parseInt(response.data.response_code) === 100) {
        this.logger.log(`Prospect operation successful: ${response.data.prospect_id || 'new prospect'}`);
        return response.data;
      } else {
        this.logger.warn(`Prospect operation failed: ${response.data.response_code} - ${response.data.resp_msg || ''}`);
        return null;
      }
    } catch (error) {
      this.logger.error('Error in findOrCreateProspect:', error.response?.data || error.message);
      throw new HttpException(
        `Failed to find/create prospect: ${error.response?.data?.resp_msg || error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async getProspectInfo(email: string | null): Promise<ProspectInfo | null> {
    const url = `${this.apiUrl}/api/v1/prospect_find`;

    const criteria = email ? { email } : {};
    const data = {
      campaign_id: "all",
      start_date: "01/01/2018",
      end_date: "01/01/2028",
      criteria,
      return_type: "prospect_view"
    };

    try {
      this.logger.log(`Searching for prospect with email: ${email || 'no email'}`);
      
      const response: AxiosResponse<StickyApiResponse> = await firstValueFrom(
        this.httpService.post(url, data, this.getAuthConfig())
      );

      if (parseInt(response.data.response_code) === 100) {
        const keys = Object.keys(response.data.data);
        const prospectInfo = response.data.data[keys[0]];
        this.logger.log(`Found prospect: ${prospectInfo.prospect_id || 'unknown'}`);
        return prospectInfo;
      } else {
        this.logger.log('No prospect found');
        return null;
      }
    } catch (error) {
      this.logger.error('Error searching for prospect:', error.response?.data || error.message);
      return null;
    }
  }

  async updateProspectCustomFields(prospectId: number, data: any): Promise<StickyApiResponse> {
    const url = `${this.apiUrl}/api/v2/prospects/${prospectId}/custom_fields`;

    try {
      this.logger.log(`Updating custom fields for prospect: ${prospectId}`);
      
      const response = await lastValueFrom(
        this.httpService.post<StickyApiResponse>(url, data, this.getAuthConfig())
      );

      this.logger.log(`Custom fields updated successfully for prospect: ${prospectId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error updating prospect custom fields:', error.response?.data || error.message);
      throw new HttpException(
        `Failed to update prospect custom fields: ${error.response?.data?.resp_msg || error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private cleanString(str: string): string {
    return str.replace(/[^a-zA-Z0-9]/g, '');
  }
} 