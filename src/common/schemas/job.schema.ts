import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { JobType, JobStatus } from '../dto/create-job.dto';

export type JobDocument = Job & Document;

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, enum: JobType })
  type: JobType;

  @Prop({ required: true, default: JobStatus.PENDING })
  status: string;

  @Prop({ required: false })
  visitorId?: string;

  @Prop({ required: false })
  accountId?: string;

  @Prop({ required: false })
  ipAddress?: string;

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  body: any;

  @Prop({ required: false })
  processedAt?: Date;

  @Prop({ required: false })
  errorMessage?: string;

  @Prop({ required: false })
  retryCount?: number;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// Add indexes for better query performance
JobSchema.index({ type: 1, status: 1 });
JobSchema.index({ createdAt: 1 });
JobSchema.index({ visitorId: 1 });
JobSchema.index({ accountId: 1 }); 