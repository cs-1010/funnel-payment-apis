import { NestFactory } from '@nestjs/core';
import { FunnelModule } from '../funnel.module';
import { FunnelSeeder } from '../seeder/funnel.seeder';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(FunnelModule);
  const seeder = app.get(FunnelSeeder);

  try {
    console.log('Starting funnel seeding...');
    await seeder.seed();
    console.log('Funnel seeding completed.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await app.close();
  }
}

bootstrap();

