import { Controller, Post, Body, Get } from '@nestjs/common';
import { ExampleService } from './example.service';

@Controller('example')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Get('test')
  async test(@Body() data: any) {
    return "test";
  }

  @Post('async-task')
  async addAsyncTask(@Body() data: any) {
    return this.exampleService.performAsyncTask(data);
  }
}

