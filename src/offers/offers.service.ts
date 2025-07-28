import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor() {}

  // Placeholder methods - implement as needed
  async getOffers(): Promise<any[]> {
    this.logger.log('Getting offers');
    return [];
  }
} 