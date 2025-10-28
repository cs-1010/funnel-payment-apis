import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Injectable, Logger, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { MongoError } from 'mongodb';
import { JobService } from '../services/job.service';
import { JobType } from '../dto/create-job.dto';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  
  constructor(private readonly jobService: JobService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorMessage = 'An unexpected error occurred';
    let errorDetails: any = null;
    let errorCode: string | null = null;

    if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      statusCode = exception.getStatus();
      const errorResponse = exception.getResponse();
      
      // Handle different response formats
      if (typeof errorResponse === 'string') {
        errorMessage = errorResponse;
      } else if (typeof errorResponse === 'object' && errorResponse !== null) {
        errorMessage = errorResponse['message'] || exception.message;
        errorDetails = errorResponse['error'] || null;
        errorCode = errorResponse['code'] || null;
      } else {
        errorMessage = exception.message;
      }
    } else if (exception instanceof MongoError) {
      // Handle MongoDB-specific errors
      switch (exception.code) {
        case 11000: // Duplicate Key Error
          errorMessage = 'Duplicate entry. This resource already exists.';
          statusCode = HttpStatus.CONFLICT;
          errorCode = 'DUPLICATE_KEY';
          break;
        case 11001: // Duplicate Key Update
          errorMessage = 'Duplicate key error during update operation.';
          statusCode = HttpStatus.CONFLICT;
          errorCode = 'DUPLICATE_KEY_UPDATE';
          break;
        case 2: // BadValue
          errorMessage = 'Invalid data provided to database.';
          statusCode = HttpStatus.BAD_REQUEST;
          errorCode = 'BAD_VALUE';
          break;
        default:
          errorMessage = 'Database error occurred';
          errorCode = 'MONGO_ERROR';
      }
      errorDetails = 'MongoDB Error';
    } else if (exception instanceof Error) {
      // Handle generic JavaScript errors
      errorMessage = exception.message;
      errorDetails = exception.name;
      
      // Check for specific error types
      if (exception.name === 'ValidationError') {
        statusCode = HttpStatus.BAD_REQUEST;
        errorCode = 'VALIDATION_ERROR';
      } else if (exception.name === 'CastError') {
        statusCode = HttpStatus.BAD_REQUEST;
        errorCode = 'CAST_ERROR';
      }
    }

    // Log the error for debugging
    //this.logger.error(`Exception caught: ${errorMessage} (Status: ${statusCode}${errorCode ? `, Code: ${errorCode}` : ''})`);

    // Create ERROR job to log the exception
    try {
      await this.jobService.createJob(JobType.ERROR, {
        errorMessage,
        errorDetails,
        errorCode,
        statusCode,
        timestamp: new Date(),
        stack: exception instanceof Error ? exception.stack : null,
      });
    } catch (jobError) {
      this.logger.error('Failed to create ERROR job in exception filter:', jobError);
    }
   
    // Prepare response object
    const responseBody: any = {
      success: false,
      data: null,
      message: errorMessage,
    };

    // Only include error details in development or for specific error types
    if (process.env.NODE_ENV === 'development' || statusCode < 500) {
      responseBody.error = errorDetails;
      if (errorCode) {
        responseBody.code = errorCode;
      }
    }

    response.status(statusCode).json(responseBody);
  }
} 