import { Test, TestingModule } from '@nestjs/testing';
import { FunnelController } from './funnel.controller';
import { FunnelService } from './funnel.service';

describe('FunnelController', () => {
  let controller: FunnelController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FunnelController],
      providers: [FunnelService],
    }).compile();

    controller = module.get<FunnelController>(FunnelController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
