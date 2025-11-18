import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const InjectIP = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request: Request = ctx.switchToHttp().getRequest();
    
    
    let ip = request.headers['cf-connecting-ip'] as string ||
              request.headers['x-real-ip'] as string ||
              request.headers['x-forwarded-for'] as string ||
              request.ip ||
              request.socket?.remoteAddress ||
              '';
    
    // If x-forwarded-for contains multiple IPs, take the first one
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    
    // Remove IPv6 prefix if present
    ip = ip.replace(/^::ffff:/, '');

    return ip;
  },
);