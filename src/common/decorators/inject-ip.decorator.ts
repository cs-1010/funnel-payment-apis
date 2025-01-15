import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const InjectIP = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request: Request = ctx.switchToHttp().getRequest();
    let ip = request.ip || request.connection.remoteAddress || '';
    
    // Remove IPv6 prefix if present
    ip = ip.replace(/^::ffff:/, '');

    return ip;
  },
);

