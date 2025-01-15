import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
class RequiredOffer {
  @Prop({ required: true })
  offer_id: number;

  @Prop({ required: true })
  product_id: number;

  @Prop()
  is_book?: string;

  @Prop([Number])
  previous_product_id?: number[];
}

@Schema({ _id: false })
class DeclineRedirect {
  @Prop({ type: RequiredOffer })
  required_offer?: RequiredOffer;

  @Prop({ type: RequiredOffer })
  automator_liftime_offer?: RequiredOffer;

  @Prop({ type: RequiredOffer })
  automator_monthly_offer?: RequiredOffer;

  @Prop({ type: RequiredOffer })
  automator_hb_lk_discount?: RequiredOffer;
}

@Schema({ _id: false })
class Page {
  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  page: string;

  @Prop()
  onbuy?: string;

  @Prop({ type: DeclineRedirect })
  'decline-redirect'?: DeclineRedirect;

  @Prop({ type: DeclineRedirect })
  'second-decline'?: DeclineRedirect;
}

@Schema()
export class Funnel extends Document {
  @Prop({ required: true })
  cId: number;

  @Prop({ required: true })
  fname: string;

  @Prop({ type: [Page], required: true })
  pages: Page[];

  @Prop()
  prospectListId?: number;

  @Prop()
  customerListId?: number;
}

export const FunnelSchema = SchemaFactory.createForClass(Funnel);

