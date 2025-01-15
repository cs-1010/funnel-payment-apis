import { HttpException, HttpStatus } from '@nestjs/common';

export class DieException extends HttpException {
  constructor(response: string | object) {
    super(response, HttpStatus.OK);
  }
}

