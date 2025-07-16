import { HttpException, HttpStatus } from "@nestjs/common"

export class DieException1 extends HttpException {
  constructor(response: string | { message: string; data?: any }) {
    super(response, HttpStatus.INTERNAL_SERVER_ERROR)
  }
}

