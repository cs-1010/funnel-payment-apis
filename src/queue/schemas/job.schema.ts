import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { string } from "joi"
import { type Document, Schema as MongooseSchema } from "mongoose"

export type JobDocument = Job & Document

@Schema({
  timestamps: true,
  timeseries: {
    timeField: "updatedAt",
    metaField: "type",
    granularity: "seconds",
  },
})
export class Job {
  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date

  @Prop({ type: MongooseSchema.Types.Mixed })
  body: any

  @Prop({ enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"], default: "PENDING" })
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
}

export const JobSchema = SchemaFactory.createForClass(Job)

// Index for automatic document removal based on updatedAt
JobSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { status: "COMPLETED" },
  },
)

