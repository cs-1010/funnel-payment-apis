import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type JobDocument = Job & Document;

@Schema({
  timestamps: true, // This will automatically add and manage createdAt and updatedAt
})
export class Job {
  @Prop({ type: MongooseSchema.Types.Mixed })
  body: any;

  @Prop({
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true,
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  result: any;

  @Prop({
    enum: [
      'PAGE_VISIT',
      'PAGE_CLICK',
      'SIGNUP',
      'SALE',
      'UPSELL_SALE',
      'FAILED_SALE',
      'FAILED_UPSELL_SALE',
      'ERROR',
      'SCORE',
    ],
    required: true,
  })
  type: string;

  @Prop({ type: String, required: false })
  visitorId?: string;

  @Prop({ type: String, required: false })
  ipAddress?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Number, default: 0 })
  retryCount?: number;

  @Prop({ type: [MongooseSchema.Types.Mixed] })
  errorLogs?: Array<{
    error: string;
    timestamp: Date;
  }>;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// Index for automatic document removal based on completedAt
JobSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { status: 'COMPLETED' },
  },
);

// Additional indexes for performance
JobSchema.index({ type: 1, status: 1 });
JobSchema.index({ visitorId: 1 });
JobSchema.index({ ipAddress: 1 });
JobSchema.index({ createdAt: 1 });