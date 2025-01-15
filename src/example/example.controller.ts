import { Controller, Post, Body } from '@nestjs/common';
import { ExampleService } from './example.service';

@Controller('example')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post('async-task')
  async addAsyncTask(@Body() data: any) {
    return this.exampleService.performAsyncTask(data);
  }
}

