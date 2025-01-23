import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { type Document, Schema as MongooseSchema } from "mongoose"

export type JobDocument = Job & Document

@Schema({ timestamps: true })
export class Job {

  @Prop({ type: MongooseSchema.Types.Mixed })
  body: any

  @Prop({ enum: ["pending", "processing", "completed", "failed"], default: "pending" })
  status: string

  @Prop({ type: MongooseSchema.Types.Mixed })
  result: any

  @Prop({ enum: ["TAG", "CUSTOMFIELDS", "PROSPECTCUSTOMERFIELDS", "UPDATELIST"], required: true })
  type: string
}

export const JobSchema = SchemaFactory.createForClass(Job)

