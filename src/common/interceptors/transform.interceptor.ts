import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler, HttpStatus } from "@nestjs/common"
import type { Observable } from "rxjs"
import { map } from "rxjs/operators"
import { CustomResponse } from "../interfaces/custom-response.interface"

export interface Response<T> {
    success: boolean
    data: T
    message: string
    statusCode: number
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
        return next.handle().pipe(
            map((result) => {
                const ctx = context.switchToHttp()
                const response = ctx.getResponse()

                let data, message, statusCode

                if (result instanceof CustomResponse) {
                    data = result.data
                    message = result.message
                    statusCode = result.statusCode
                } else {
                    data = result
                    message = "Operation successful"
                    statusCode = response.statusCode || HttpStatus.OK
                }

                response.status(statusCode)

                return {
                    success: true,
                    data,
                    message,
                    statusCode,
                }
            }),
        )
    }
}

