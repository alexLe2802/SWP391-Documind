import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExtractionQueueItem {
  jobId: string;
  documentId: string;
}

type ExtractionQueueProcessor = (item: ExtractionQueueItem) => Promise<void>;

@Injectable()
export class ExtractionQueueService {
  private readonly logger = new Logger(ExtractionQueueService.name);
  private readonly runningJobIds = new Set<string>();
  private readonly queuedJobIds = new Set<string>();
  private readonly pendingItems: ExtractionQueueItem[] = [];
  private readonly concurrency: number;
  private processor?: ExtractionQueueProcessor;

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(configService: ConfigService) {
    const configured = configService.get<number>(
      'EXTRACTION_QUEUE_CONCURRENCY',
    );
    this.concurrency =
      typeof configured === 'number' && Number.isInteger(configured)
        ? Math.max(1, Math.min(configured, 10))
        : 2;
  }

  // Tạo hoặc lưu đăng ký processor.
  registerProcessor(processor: ExtractionQueueProcessor): void {
    this.processor = processor;
    this.drain();
  }

  // Thực hiện chức năng enqueue.
  enqueue(item: ExtractionQueueItem): void {
    if (
      this.runningJobIds.has(item.jobId) ||
      this.queuedJobIds.has(item.jobId)
    ) {
      return;
    }

    this.queuedJobIds.add(item.jobId);
    this.pendingItems.push(item);
    this.drain();
  }

  // Lấy dữ liệu snapshot.
  getSnapshot(): { running: number; queued: number; total: number } {
    const running = this.runningJobIds.size;
    const queued = this.pendingItems.length;
    return { running, queued, total: running + queued };
  }

  // Thực hiện chức năng drain.
  private drain(): void {
    while (
      this.processor &&
      this.runningJobIds.size < this.concurrency &&
      this.pendingItems.length > 0
    ) {
      const item = this.pendingItems.shift();
      if (!item) return;
      this.queuedJobIds.delete(item.jobId);
      this.runningJobIds.add(item.jobId);
      void this.process(item);
    }
  }

  // Xử lý process.
  private async process(item: ExtractionQueueItem): Promise<void> {
    try {
      await this.processor?.(item);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'extraction.queue.processor_failed',
          jobId: item.jobId,
          documentId: item.documentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    } finally {
      this.runningJobIds.delete(item.jobId);
      this.drain();
    }
  }
}
