import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';


@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>, private readonly configService: ConfigService) { }

  async addTask(url: string, method: string, body: any): Promise<TaskDocument> {
    const baseUrl = "";//this.configService.get<string>('BASE_URL');
    url = `${baseUrl}${url}`;
    const newTask = new this.taskModel({ url, method, body });
    return newTask.save();
  }

  async processNextTask(): Promise<void> {
    const task = await this.taskModel.findOneAndUpdate(
      { status: 'pending' },
      { status: 'processing' },
      { sort: { createdAt: 1 }, new: true }
    );

    if (!task) {
      return;
    }

    try {
      const response = await axios({
        method: task.method,
        url: task.url,
        data: task.body,
      });

      task.status = 'completed';
      task.result = response.data;
      await task.save();

      this.logger.debug(`Task ${task._id} completed successfully`);
    } catch (error) {
      task.status = 'failed';
      task.result = { error: error.message };
      await task.save();

      this.logger.error(`Task ${task._id} failed: ${error.message}`);
    }
  }

  async startProcessing(interval: number = 5000): Promise<void> {
    setInterval(() => this.processNextTask(), interval);
  }
}

