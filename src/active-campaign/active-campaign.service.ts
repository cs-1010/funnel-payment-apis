import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ActiveCampaignService {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly apiUrlV1: string;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('ACTIVE_CAMPAIGN_API_URL') || '';
    this.apiToken = this.configService.get<string>('ACTIVE_CAMPAIGN_API_TOKEN') || '';
    this.apiUrlV1 = this.configService.get<string>('ACTIVE_CAMPAIGN_API_URL_V1') || '';
  }

  async updateEmailOfContact(oldEmail: string, newEmail: string): Promise<any> {
    const contact = await this.getContactByEmail(oldEmail);
    if (contact && contact.id) {
      const url = `${this.apiUrlV1}/admin/api.php`;
      const params = new URLSearchParams({
        api_key: this.apiToken,
        api_action: 'contact_edit',
        api_output: 'json',
        email: oldEmail,
        id: contact.id.toString(),
        overwrite: '0',
      });

      try {
        const response = await axios.post(url, params);
        return response.data;
      } catch (error) {
        console.error('Error updating email:', error);
        throw error;
      }
    }
  }

  async updateList(oldList: string, newList: string, email: string): Promise<any> {
    const contact = await this.getContactByEmail(email);
    if (contact && contact.id) {
      const url = `${this.apiUrl}/contactLists`;
      const headers = { 'Api-Token': this.apiToken };

      try {
        // Unsubscribe from old list
        await axios.post(url, {
          contactList: { list: oldList, contact: contact.id, status: 2 }
        }, { headers });

        // Subscribe to new list
        const response = await axios.post(url, {
          contactList: { list: newList, contact: contact.id, status: 1 }
        }, { headers });

        return response.data;
      } catch (error) {
        console.error('Error updating list:', error);
        throw error;
      }
    } else {
      // Add contact to ActiveCampaign with updated list
      return this.syncContact({ email, 'p[3]': newList });
    }
  }

  async getContactByEmail(email: string): Promise<any> {
    const url = `${this.apiUrlV1}/admin/api.php`;
    const params = new URLSearchParams({
      api_key: this.apiToken,
      api_action: 'contact_view_email',
      api_output: 'json',
      email,
    });

    try {
      const response = await axios.get(`${url}?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error getting contact:', error);
      throw error;
    }
  }

  async removeTag(email: string, tag: string): Promise<any> {
    const url = `${this.apiUrlV1}/admin/api.php`;
    const params = new URLSearchParams({
      api_key: this.apiToken,
      api_action: 'contact_tag_remove',
      api_output: 'json',
    });

    const data = new URLSearchParams({ email, tags: tag });

    try {
      const response = await axios.post(`${url}?${params}`, data);
      return response.data;
    } catch (error) {
      console.error('Error removing tag:', error);
      throw error;
    }
  }

  async syncContact(contactData: any): Promise<any> {
    const url = `${this.apiUrlV1}/admin/api.php`;
    const params = new URLSearchParams({
      api_key: this.apiToken,
      api_action: 'contact_sync',
      api_output: 'json',
    });

    const data = new URLSearchParams(contactData);

    try {
      const response = await axios.post(`${url}?${params}`, data);
      return response.data;
    } catch (error) {
      console.error('Error syncing contact:', error);
      throw error;
    }
  }

  async addUpdateContacts(contactData: any): Promise<any> {
    const url = `${this.apiUrl}/contact/sync`;
    const headers = { 'Api-Token': this.apiToken };

    try {
      const response = await axios.post(url, contactData, { headers });
      return response.data;
    } catch (error) {
      console.error('Error adding/updating contacts:', error);
      throw error;
    }
  }
}

