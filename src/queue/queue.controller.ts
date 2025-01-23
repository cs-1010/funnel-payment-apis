import { Controller, Post, Body } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) { }

  @Post('task')
  async addJob(@Body() taskData: { jobtype: string; body: any }) {
    const task = await this.queueService.addJob(taskData.jobtype, taskData.body);
    return { message: 'Task added to queue', taskId: task._id.toString() };
  }
}

