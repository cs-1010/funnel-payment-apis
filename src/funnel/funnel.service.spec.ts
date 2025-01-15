import { Test, TestingModule } from '@nestjs/testing';
import { FunnelService } from './funnel.service';

describe('FunnelService', () => {
  let service: FunnelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FunnelService],
    }).compile();

    service = module.get<FunnelService>(FunnelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
