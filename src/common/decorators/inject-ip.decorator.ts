import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const InjectIP = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const ip = request.ip || request.connection.remoteAddress || request.headers['x-forwarded-for'] 
    || request.socket.remoteAddress || 'unknown';
    
    // Remove IPv6 prefix if present
    return ip.replace(/^::ffff:/, '');
  },
); 