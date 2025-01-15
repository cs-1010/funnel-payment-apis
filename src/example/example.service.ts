import { Injectable } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ExampleService {
  constructor(private readonly queueService: QueueService) {}

  async performAsyncTask(data: any) {
    await this.queueService.addTask(
      'https://api.publicapis.org/entries',
      'POST',
      { data }
    );
    return { message: 'Task added to queue' };
  }
}

