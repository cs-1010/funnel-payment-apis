import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { MongoError } from 'mongodb';
import { QueueService } from 'src/queue/queue.service'
import { JOBS } from 'src/common/Dto/job.dto'

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly queueService: QueueService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = 500;
    let errorMessage = 'An unexpected error occurred';
    let errorDetails: any = null;

    if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      statusCode = exception.getStatus();
      const errorResponse = exception.getResponse();
      errorMessage = errorResponse['message'] || exception.message;
      errorDetails = errorResponse['error'] || null;
    } else if (exception instanceof MongoError) {
      // Handle MongoDB-specific errors
      switch (exception.code) {
        case 11000: // Duplicate Key Error
          errorMessage = 'Duplicate entry. This resource already exists.';
          statusCode = 400;
          break;
        default:
          errorMessage = 'Database error occurred';
      }
      errorDetails = 'MongoDB Error';
    }
    this.queueService.addJob(JOBS.ERROR, {"errorMessage" : errorMessage, errorDetails : errorDetails });
    response.status(statusCode).json({
      success: false,
      data: null,
      message: errorMessage,
      error: errorDetails,
    });
  }
}
