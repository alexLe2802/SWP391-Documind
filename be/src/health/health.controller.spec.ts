import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the API is healthy', () => {
    const health = { liveness: jest.fn().mockReturnValue({ status: 'ok' }) };
    const controller = new HealthController(health as never);

    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
