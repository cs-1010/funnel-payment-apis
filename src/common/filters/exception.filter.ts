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

  /**
   * Determine if an error job should be skipped based on status code and error message
   */
  private shouldSkipErrorJob(statusCode: number, errorMessage: string): boolean {
    // Skip 404 errors (Not Found) - these are usually client-side requests for non-existent resources
    if (statusCode === HttpStatus.NOT_FOUND) {
      return true;
    }

    // Skip common browser requests that result in 404s
    const common404Patterns = [
      'favicon.ico',
      'robots.txt',
      'apple-touch-icon',
      'apple-touch-icon-precomposed',
      'browserconfig.xml',
      'manifest.json',
      '.well-known/',
      'sitemap.xml'
    ];

    if (statusCode === HttpStatus.NOT_FOUND) {
      return common404Patterns.some(pattern => 
        errorMessage.toLowerCase().includes(pattern.toLowerCase())
      );
    }

    // Skip 401 Unauthorized for common authentication issues (optional)
    // if (statusCode === HttpStatus.UNAUTHORIZED) {
    //   return true;
    // }

    // Skip 403 Forbidden for common access issues (optional)
    // if (statusCode === HttpStatus.FORBIDDEN) {
    //   return true;
    // }

    return false;
  }

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

    // Skip creating ERROR jobs for common non-critical errors
    const shouldSkipJob = this.shouldSkipErrorJob(statusCode, errorMessage);
    
    if (!shouldSkipJob) {
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
    } else {
      // Log skipped errors for debugging but don't create jobs
      this.logger.debug(`Skipped ERROR job for ${statusCode}: ${errorMessage}`);
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