import { Test, TestingModule } from '@nestjs/testing';
import { ActiveCampaignService } from './active-campaign.service';
import { ConfigService } from '@nestjs/config';

describe('ActiveCampaignService', () => {
  let service: ActiveCampaignService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActiveCampaignService, { provide: ConfigService, useValue: { get: jest.fn() } }],
    }).compile();

    service = module.get<ActiveCampaignService>(ActiveCampaignService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
