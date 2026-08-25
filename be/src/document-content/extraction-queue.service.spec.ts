import { ConfigService } from '@nestjs/config';
import { ExtractionQueueService } from './extraction-queue.service';

describe('ExtractionQueueService', () => {
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

  it('limits concurrent processors and drains queued jobs', async () => {
    const service = new ExtractionQueueService(
      new ConfigService({ EXTRACTION_QUEUE_CONCURRENCY: 1 }),
    );
    const releases: Array<() => void> = [];
    const processor = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    service.registerProcessor(processor);

    service.enqueue({ jobId: 'job-1', documentId: 'doc-1' });
    service.enqueue({ jobId: 'job-2', documentId: 'doc-2' });
    await flush();

    expect(processor).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toEqual({ running: 1, queued: 1, total: 2 });

    releases[0]();
    await flush();
    expect(processor).toHaveBeenCalledTimes(2);
    releases[1]();
    await flush();
    expect(service.getSnapshot()).toEqual({ running: 0, queued: 0, total: 0 });
  });

  it('deduplicates jobs that are queued or running', async () => {
    const service = new ExtractionQueueService(
      new ConfigService({ EXTRACTION_QUEUE_CONCURRENCY: 1 }),
    );
    let release: (() => void) | undefined;
    const processor = jest.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    service.registerProcessor(processor);

    service.enqueue({ jobId: 'job-1', documentId: 'doc-1' });
    service.enqueue({ jobId: 'job-1', documentId: 'doc-1' });
    await flush();

    expect(processor).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().total).toBe(1);
    release?.();
    await flush();
  });
});
