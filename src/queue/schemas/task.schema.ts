import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  method: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  body: any;

  @Prop({ enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  result: any;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

