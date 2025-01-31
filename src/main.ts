import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
// import { QueueService } from './queue/queue.service';
// import { CommandModule, CommandService } from 'nestjs-command';


async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  app.enableCors();
  app.useGlobalFilters(new HttpExceptionFilter()) //This line was already correctly placed.  The error message is misleading.
  app.useGlobalInterceptors(new TransformInterceptor())
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