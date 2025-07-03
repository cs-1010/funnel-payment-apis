import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
// import { QueueService } from './queue/queue.service';
// import { CommandModule, CommandService } from 'nestjs-command';


async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
 
  app.enableCors({
    origin: [
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:5173',
      'https://creditsecrets.com',
      // Add other domains as needed
    ],
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
    credentials: true, // Can be true when using specific origins
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });
  
  const configService = app.get(ConfigService);


  const port = configService.get<number>('port');

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

  app.useGlobalFilters(new GlobalExceptionFilter()) //This line was already correctly placed.  The error message is misleading.
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )


  // const queueService = app.get(QueueService);
  // queueService.startProcessing();

  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Failed to start application:', error);
});