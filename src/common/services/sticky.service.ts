import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as https from 'https';
import { DieException } from '../exceptions/die.exception';
import { FunnelDto } from 'src/funnel/dto/funnel.dto';
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
  utm_campaign?: string;
}



// Define an interface for the API response
interface ApiResponse {
  response_code: number;
  prospectId: string;
}

@Injectable()
export class StickyService {
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

  async findOrCreateProspect(postData: FunnelDto, cId: string, ip: string): Promise<any | null> {
   
    const customerInfo = await this.getProspectInfo(postData.email);
  
    const prospectData: ProspectData = {
      campaignId: cId,
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

    
  

    if (postData.AFID) {
      prospectData.AFID = this.cleanString(postData.AFID);
      prospectData.AFFID = this.cleanString(postData.AFID);
    }

    if (postData.SID) {
      prospectData.SID = this.cleanString(postData.SID);
      prospectData.C1 = this.cleanString(postData.SID);
    }


    if (postData.C2) {
      prospectData.AFID = this.cleanString(postData.C2);
      prospectData.C2 = this.cleanString(postData.C2);
    }

    if (postData.C3) {
      prospectData.SID = this.cleanString(postData.C3);
      prospectData.C3 = this.cleanString(postData.C3);
    }

 
   
      const apiUrl = `${this.apiUrl}/api/v1/new_prospect`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post<any>(apiUrl, prospectData, {
          auth: {
            username: this.username,
            password: this.password,
          },
        })
      );
      
      if (parseInt(response.data.response_code) === 100) {
        
        return response.data;
      }
    
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
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
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
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
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

