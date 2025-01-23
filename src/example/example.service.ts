import { Injectable } from '@nestjs/common';


@Injectable()
export class ExampleService {
  constructor() { }

  async performAsyncTask(data: any) {

    return { message: 'Task added to queue' };
  }
}

