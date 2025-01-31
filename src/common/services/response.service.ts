import { Injectable, HttpStatus } from "@nestjs/common"

export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  message: string
  data?: T
}

@Injectable()
export class ResponseService {
  success<T>(data: T, message = "Success", statusCode: number = HttpStatus.OK): ApiResponse<T> {
    return {
      success: true,
      statusCode,
      message,
      data,
    }
  }

  error(message = "Error", statusCode: number = HttpStatus.BAD_REQUEST): ApiResponse<null> {
    return {
      success: false,
      statusCode,
      message,
      data: null,
    }
  }
}

