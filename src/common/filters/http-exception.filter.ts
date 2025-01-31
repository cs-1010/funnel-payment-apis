import { type ExceptionFilter, Catch, type ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common"
import type { Response } from "express"
import { DieException } from "../exceptions/die.exception"

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse<Response>()

        let status = HttpStatus.INTERNAL_SERVER_ERROR
        let message = "Internal server error"
        let data = null
        let success = false
        let exceptionName = "UnknownException"
        let lineNumber = "Unknown"
        let errorMessage = "An unexpected error occurred"
        let fileName = "Unknown"

        if (exception instanceof DieException) {
            status = exception.getStatus()
            const exceptionResponse = exception.getResponse() as any
            message = exceptionResponse.message || "Die Exception occurred"
            data = exceptionResponse.data || null
            success = false
            exceptionName = "DieException"
        } else if (exception instanceof HttpException) {
            status = exception.getStatus()
            const exceptionResponse = exception.getResponse()
            message =
                typeof exceptionResponse === "string" ? exceptionResponse : (exceptionResponse as any).message || message
            exceptionName = exception.constructor.name
        } else if (exception instanceof Error) {
            message = exception.message
            exceptionName = exception.constructor.name
            errorMessage = exception.message
        }

        // Extract file name and line number from the stack trace
        if (exception instanceof Error && exception.stack) {
            const stackLines = exception.stack.split("\n")
            if (stackLines.length > 1) {
                const match = stackLines[1].match(/at\s+(.+):(\d+):\d+/)
                if (match) {
                    fileName = match[1]
                    lineNumber = match[2]
                }
            }
        }

        console.error("Exception caught:", exception)

        response.status(status).json({
            success: success,
            statusCode: status,
            message: message,
            data: data,
            exceptionDetails: {
                name: exceptionName,
                fileName: fileName,
                lineNumber: lineNumber,
                errorMessage: errorMessage,
            },
        })
    }
}

