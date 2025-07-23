import { Controller, Post, Body } from '@nestjs/common';
import { QueueService } from './queue.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CustomResponse } from 'src/common/interfaces/custom-response.interface';
import { InjectIP } from 'src/common/decorators/inject-ip.decorator';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) { }

  @Post('task')
  async addJob(@Body() taskData: CreateTaskDto, @InjectIP() ipAddress: string) {
    const task = await this.queueService.addJob(taskData.jobType, taskData.body, ipAddress);
    return new CustomResponse({ jobId: task._id }, "Task Added Successfully", 200);
  }

}

