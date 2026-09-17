import { ConversionService } from './conversion.service';
import { normalizeConversionJourney } from './conversion-journey';

it('retains earlier nodes and A/B revisits and supports the ftVisitorId alias', () => {
  const payload: any = { ftVisitorId: 'visitor-123', ftNodeId: 'checkout', nodePath: ' landing,a,landing,b ' };
  normalizeConversionJourney(payload);
  expect(payload).toMatchObject({ visitorId: 'visitor-123', ftVisitorId: 'visitor-123', nodePath: 'landing,a,landing,b,checkout' });
});
it('keeps normalization idempotent and fills only the actual node for a legacy empty path', () => {
  const payload: any = { ftNodeId: 'checkout' }; normalizeConversionJourney(payload); normalizeConversionJourney(payload);
  expect(payload.nodePath).toBe('checkout');
});
it.each([{ nodePath: { node: 'bad' } }, { nodePath: '{{nodePath}}' }, { visitorId: 'one', ftVisitorId: 'two' }])
('rejects invalid tracking before a signup/charge is invoked', async input => {
  const service = new ConversionService({} as any, {} as any, {} as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any);
  const charge = jest.spyOn(service, 'processCheckout').mockResolvedValue({});
  await expect(service.process({ conversionType: 'PURCHASE', ...input } as any)).rejects.toThrow();
  expect(charge).not.toHaveBeenCalled();
});
it('retains the complete path and both visitor aliases in the durable payment job payload', () => {
  const service = new ConversionService({} as any, {} as any, {} as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any);
  const result = (service as any).prepareQueueData({}, { ftVisitorId: 'visitor-123', ftNodeId: 'checkout', nodePath: 'landing,vsl' }, {});
  expect(result.postedPayload).toMatchObject({ visitorId: 'visitor-123', ftVisitorId: 'visitor-123', nodePath: 'landing,vsl,checkout' });
});
it.each(['processSignup', 'processCheckout', 'processUpsell'] as const)('validates %s before any provider or queue operation', async method => {
  const provider = { createProspect: jest.fn(), processCheckout: jest.fn(), processUpsell: jest.fn() };
  const queue = { createJob: jest.fn() };
  const service = new ConversionService({} as any, provider as any, queue as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any);
  await expect(service[method]({ nodePath: '{{nodePath}}' } as any)).rejects.toThrow('Invalid node');
  Object.values(provider).forEach(mock => expect(mock).not.toHaveBeenCalled()); expect(queue.createJob).not.toHaveBeenCalled();
});
