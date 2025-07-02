import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as https from 'https';
import { DieException } from '../exceptions/die.exception';
import { ConversionDto } from 'src/conversion/dto/conversion.dto';
import { lastValueFrom } from 'rxjs';
// Define interfaces for the data structures
interface ProspectInfo {
  first_name?: string;
  last_name?: string;
  affiliate?: string;
  sub_affiliate?: string;
  custom_fields?: { name: string; values: { value: string }[] }[];
  prospect_id?: string;
}

interface ProspectData {
  campaignId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  zip: string;
  state: string;
  address1: string;
  country: string;
  ipAddress: string;
  AFID?: string;
  AFFID?: string;
  SID?: string;
  C1?: string;
  C2?: string;
  C3?: string;
  click_id?: string;
  utm_campaign?: string;
}



// Define an interface for the API response
interface ApiResponse {
  response_code: number;
  prospectId: string;
}

@Injectable()
export class StickyService {
  async updateProspect(prospectData: any): Promise<any> {
    const apiUrl = `${this.apiUrl}/api/v1/prospect_update`;

    try {
      const response = await lastValueFrom(this.httpService.post(apiUrl, prospectData, {
        auth: {
          username: this.username,
          password: this.password
        },
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      }));

      return response.data;
    } catch (error) {
      console.error('Error updating prospect:', error.response?.data || error.message);
      throw new HttpException('Failed to update prospect', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
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
  }
  async processNewOrder(orderData: any, isNewCheckout: boolean = false): Promise<any> {
    let apiUrl = '';
    if (isNewCheckout) {
      apiUrl = `${this.apiUrl}/api/v1/new_order`;
    } else {
      apiUrl = `${this.apiUrl}/api/v1/new_order_with_prospect`;
    }
    try {
      const response = await lastValueFrom(this.httpService.post(apiUrl, orderData, {
        auth: {
          username: this.username,
          password: this.password
        },
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        timeout: 30000, // 30 second timeout
      }));

      return response.data;
    } catch (error) {
      console.error('Error processing new order:', error.response?.data || error.message);
      throw new HttpException('Failed to process new order', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async processNewUpsell(upsellData: any): Promise<any> {
    const apiUrl = `${this.apiUrl}/api/v1/new_upsell`;

    try {
      const response = await lastValueFrom(this.httpService.post(apiUrl, upsellData, {
        auth: {
          username: this.username,
          password: this.password
        },
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        timeout: 30000, // 30 second timeout
      }));

      return response.data;
    } catch (error) {
      console.error('Error processing new upsell:', error.response?.data || error.message);
      throw new HttpException('Failed to process new upsell', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getCampaignView(campaignId: number): Promise<any> {
    const apiUrl = `${this.apiUrl}/api/v1/campaign_view`;
    const data = { campaign_id: campaignId };

    try {
      const response = await lastValueFrom(this.httpService.post(apiUrl, data, {
        auth: {
          username: this.username,
          password: this.password
        },
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        timeout: 30000, // 30 second timeout
      }));

      return response.data;
    } catch (error) {
      console.error('Error fetching campaign view:', error.response?.data || error.message);
      throw new HttpException('Failed to fetch campaign view', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOrCreateProspect(postData: ConversionDto, ip: string): Promise<any | null> {


    const prospectData: ProspectData = {
      campaignId: '1',
      email: postData.email,
      firstName: postData.firstName || '',
      lastName: postData.lastName || '',
      phone: postData.phone || '',
      city: postData.city || postData.city || '',
      zip: postData.zip || postData.zip || '',
      state: postData.state || postData.state || '',
      address1: postData.address1 || '',
      country: 'US',
      ipAddress: ip || '127.0.0.1',
    };

    if (postData.lastAttribution && postData.lastAttribution._ef_transaction_id) {
      prospectData.click_id = postData.lastAttribution._ef_transaction_id;
    }


    if (postData.afId) {
      prospectData.AFID = this.cleanString(postData.afId);
      prospectData.AFFID = this.cleanString(postData.afId);
    }

    if (postData.sid) {
      prospectData.SID = this.cleanString(postData.sid);
      prospectData.C1 = this.cleanString(postData.sid);
    }


    if (postData.c2) {
      prospectData.AFID = this.cleanString(postData.c2);
      prospectData.C2 = this.cleanString(postData.c2);
    }

    if (postData.c3) {
      prospectData.SID = this.cleanString(postData.c3);
      prospectData.C3 = this.cleanString(postData.c3);
    }

  
    const apiUrl = `${this.apiUrl}/api/v1/new_prospect`;
    const response: AxiosResponse<any> = await firstValueFrom(
      this.httpService.post<any>(apiUrl, prospectData, {
        auth: {
          username: this.username,
          password: this.password,
        },
        timeout: 30000, // 30 second timeout
      })
    );

    if (parseInt(response.data.response_code) === 100) {

      return response.data;
    }
    return null;
  }

  private async getProspectInfo(email: string | null): Promise<any | ProspectInfo | null> {
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
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.post(url, data, {
          auth: {
            username: this.username,
            password: this.password,
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 30000, // 30 second timeout
        })
      );

      if (parseInt(response.data.response_code) === 100) {
        const keys = Object.keys(response.data.data);
        return response.data.data[keys[0]];
      } else {
        return null;
      }
    } catch (error) {

      return null;
    }
  }

  async updateProspectCustomFields(prospectId: string, data: any) {
    const url = `${this.apiUrl}/api/v2/prospects/${prospectId}/custom_fields`;

    try {
      const response = await lastValueFrom(this.httpService.post(url, data, {
        auth: {
          username: this.username,
          password: this.password
        },
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        timeout: 30000, // 30 second timeout
      }));
      return response.data;
    } catch (error) {
      console.error('Error updating prospect custom fields:', error);
      throw error;
    }
  }



  private cleanString(str: string): string {
    return str.replace(/[^a-zA-Z0-9]/g, '');
  }
}

