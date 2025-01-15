import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Funnel } from '../schemas/funnel.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FunnelSeeder {
  constructor(@InjectModel(Funnel.name) private funnelModel: Model<Funnel>) {}

  async seed() {
    try {
      const seedDataPath = path.resolve(__dirname, '..', '..', '..', 'src', 'funnel', 'seeder', 'funnel-seed-data.json');
      const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf-8'));

      await this.funnelModel.deleteMany({});

      for (const funnelData of seedData) {
        const createdFunnel = new this.funnelModel(funnelData);
        await createdFunnel.save();
      }

      console.log('Funnels seeded successfully');
    } catch (error) {
      console.error('Error seeding funnels:', error);
      throw error;
    }
  }
}

