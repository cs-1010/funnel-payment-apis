import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Document, Schema as MongooseSchema } from "mongoose"

export type JobDocument = Job & Document

@Schema({
  timestamps: true, // This will automatically add and manage createdAt and updatedAt
  timeseries: {
    timeField: "createdAt",
    metaField: "type",
    granularity: "seconds",
  },
})
export class Job {
  @Prop({ type: MongooseSchema.Types.Mixed })
  body: any

  @Prop({
    enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
    default: "PENDING",
    index: true
  })
  status: string

  @Prop({ type: MongooseSchema.Types.Mixed })
  result: any

  @Prop({
    enum: ["AC_TAGS", "STICKY_ORDER_CUSTOM_FIELDS", "STICKY_PROSPECT_CUSTOM_FIELDS", "AC_UPDATE_LIST", "PAGE_VISIT", "PAGE_CLICK"],
    required: true,
  })
  type: string

  @Prop({ type: String, required: false })
  visitorId?: string

  @Prop({ type: Date })
  completedAt?: Date
}

export const JobSchema = SchemaFactory.createForClass(Job)

// Index for automatic document removal based on completedAt
JobSchema.index(
  { completedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { status: "COMPLETED" },
  },
)