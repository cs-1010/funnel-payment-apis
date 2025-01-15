import { Controller, Post, Body } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('task')
  async addTask(@Body() taskData: { url: string; method: string; body: any }) {
    const task = await this.queueService.addTask(taskData.url, taskData.method, taskData.body);
    return { message: 'Task added to queue', taskId: task._id.toString() };
  }
}

