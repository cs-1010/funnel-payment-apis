import { Injectable, HttpStatus } from '@nestjs/common';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data?: T;
}

@Injectable()
export class ResponseService {
  success<T>(data: T, message: string = 'Success', statusCode: number = HttpStatus.OK): ApiResponse<T> {
    return {
      statusCode,
      message,
      data,
    };
  }

  error(message: string = 'Error', statusCode: number = HttpStatus.BAD_REQUEST): ApiResponse<null> {
    return {
      statusCode,
      message,
      data: null,
    };
  }
}

