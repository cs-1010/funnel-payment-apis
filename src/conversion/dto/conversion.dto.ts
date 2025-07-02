import {
  IsArray,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsEmail,
  IsOptional,
  IsIP,
  ValidateIf,
  IsBoolean,
  IsObject,
  IsNumber,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';

export enum ConversionType {
  SIGNUP = 'SIGNUP',
  PURCHASE = 'PURCHASE',
  UPSELL = 'UPSELL',

}

export type Attribution = Record<string, any>; // Allows any key-value pairs
export type DeviceInfo = Record<string, any>; // Allows any key-value pairs

export class ConversionDto {
  
  
  @IsNotEmpty()
  conversionType: ConversionType;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  externalIds: Record<string, any>;

  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({
    message:
      'Email is required',
  })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone number must not exceed 20 characters' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'City must not exceed 50 characters' })
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'ZIP code must not exceed 10 characters' })
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'State must not exceed 50 characters' })
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must not exceed 100 characters' })
  address1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must not exceed 100 characters' })
  address2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2, { message: 'Country code must be 2 characters' })
  @MinLength(2, { message: 'Country code must be 2 characters' })
  country?: string;

  @IsOptional()
  @IsIP(undefined, { message: 'Invalid IP address' })
  @Expose()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'AFID must not exceed 50 characters' })
  afId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'AFFID must not exceed 50 characters' })
  affId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'SID must not exceed 50 characters' })
  sid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'C1 must not exceed 50 characters' })
  c1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'C2 must not exceed 50 characters' })
  c2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'C3 must not exceed 50 characters' })
  c3?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(250, { each: true, message: 'Each tag must not exceed 50 characters' })
  tags?: string[];

  @IsOptional()
  @IsString()
  frNodeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Device must not exceed 50 characters' })
  device?: string;

  @IsOptional()
  @IsString()
  ga4ClientId?: string;

  @IsOptional()
  @IsString()
  everFlowclickId?: string;

  @IsOptional()
  @IsString()
  ga4SessionId?: string;

  @IsOptional()
  @IsString()
  frFunnelId?: string;

  @IsOptional()
  @IsString()
  prospectId?: string;

  @IsOptional()
  @IsString()
  quizAnswers?: string;

  @ValidateIf((o) => o.conversionType === ConversionType.PURCHASE)
  @IsNotEmpty({ message: 'Credit card number is required for checkout' })
  @IsString()
  @MaxLength(255)
  creditCardNumber?: string;

  @ValidateIf((o) => o.conversionType === ConversionType.PURCHASE)
  @IsNotEmpty({ message: 'Credit card expiry month is required for checkout' })
  @IsString()
  @MaxLength(2)
  ccExpiryMonth?: string;

  @ValidateIf((o) => o.conversionType === ConversionType.PURCHASE)
  @IsNotEmpty({ message: 'Credit card expiry year is required for checkout' })
  @IsString()
  @MaxLength(4)
  ccExpiryYear?: string;

  @ValidateIf((o) => o.conversionType === ConversionType.PURCHASE)
  @IsNotEmpty({ message: 'Credit card cvc is required for checkout' })
  @IsString()
  @MaxLength(4)
  cvc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  billingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  billingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingZip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  billingCountry?: string;

  @ValidateIf((o) => o.conversionType === ConversionType.PURCHASE || o.conversionType === ConversionType.UPSELL)
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  offers: Record<string, any>;

  @IsOptional()
  @IsString()
  products?: string;

  @IsOptional()
  @IsString()
  utmCampaignId?: string;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @ValidateIf((o) => o.conversionType === ConversionType.UPSELL)
  @IsNotEmpty({ message: 'Previous order ID is required for upsells' })
  @IsString()
  preOrderId?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  fallbackOffers?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Visitor ID must not exceed 100 characters' })
  visitorId?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  firstAttribution?: Attribution;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  lastAttribution?: Attribution;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  deviceInfo?: DeviceInfo;
}