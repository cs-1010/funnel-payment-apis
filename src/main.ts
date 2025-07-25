import { NestFactory } from '@nestjs/core';
//import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// import { CommandModule, CommandService } from 'nestjs-command';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
 
  app.enableCors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);
      
      // List of allowed domains
      const allowedOrigins = [
        'https://creditsecrets.com',
        'https://www.creditsecrets.com',
        'http://localhost:5173',
        'http://127.0.0.1:3001'
      ];
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // For development, you can log unknown origins
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type', 
      'Accept',
      'Authorization',
      'Cache-Control',
      'Pragma'
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });
  
  //const configService = app.get(ConfigService);

  //const port = configService.get<number>('port');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Use the underlying Express instance to set 'trust proxy'
  app.set('trust proxy', 1);

  app.setGlobalPrefix("api");

  const globalExceptionFilter = app.get(GlobalExceptionFilter);
  app.useGlobalFilters(globalExceptionFilter);
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )




  // await app.listen(port);
  
  await app.listen(process.env.PORT ?? 4000);

  //logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Failed to start application:', error);
});