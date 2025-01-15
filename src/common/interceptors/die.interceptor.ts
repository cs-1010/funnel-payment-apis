import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpStatus } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DieException } from '../exceptions/die.exception';

@Injectable()
export class DieInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(error => {
        if (error instanceof DieException) {
          const response = context.switchToHttp().getResponse();
          response.status(HttpStatus.OK).json(error.getResponse());
          return throwError(() => error);
        }
        return throwError(() => error);
      }),
    );
  }
}

