import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map((data: any) => {
        // Check if the response indicates a failure
        const isFailure = data && (
          data.success === false || 
          data.payment_failed === true || 
          data.error
        );

        if (isFailure) {
          // Extract error message and details
          const errorMessage = data.error || 'Request failed';
          const errorDetails = data.error ? data.error : null;
          
          // Remove error fields from data to avoid duplication
          const { success, error, payment_failed, http_status, ...cleanData } = data;
          
          return {
            success: false,
            data: cleanData,
            message: errorMessage,
            error: errorDetails,
            ...(http_status && { http_status })
          };
        }

        // Default success response
        return {
          success: true,
          data,
          message: 'Request successful',
          error: null,
        };
      }),
    );
  }
} 