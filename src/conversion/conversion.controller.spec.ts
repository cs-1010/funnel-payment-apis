import { Test, TestingModule } from '@nestjs/testing';
import { ConversionController } from './conversion.controller';
import { ConversionService } from './conversion.service';
import { VrioService } from '../vrio/vrio.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('FunnelController', () => {
  let controller: ConversionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversionController],
      providers: [
        { provide: ConversionService, useValue: {} },
        { provide: VrioService, useValue: {} },
      ],
    }).overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }).compile();

    controller = module.get<ConversionController>(ConversionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
