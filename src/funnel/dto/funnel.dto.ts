import { IsNumber,IsArray, IsString, IsNotEmpty, MinLength, MaxLength, IsInt, Min, Max, IsEmail, IsOptional, IsIP, ValidateIf } from 'class-validator';
import { Expose } from 'class-transformer';

export class FunnelDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Funnel name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Funnel name must not exceed 50 characters' })
  fname: string;

  @IsInt({ message: 'Campaign ID must be an integer' })
  @Min(1, { message: 'Campaign ID must be at least 1' })
  @Max(999999999, { message: 'Campaign ID must not exceed 999999999' })
  cId: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Page type must be at least 2 characters long' })
  @MaxLength(50, { message: 'Page type must not exceed 50 characters' })
  ptype: string;

  @ValidateIf(o => o.ptype === 'vsl')
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required when page type is "vsl"' })
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
  @MaxLength(100, { message: 'Address must not exceed 100 characters' })
  address1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2, { message: 'Country code must be 2 characters' })
  @MinLength(2, { message: 'Country code must be 2 characters' })
  country?: string;

  @IsOptional()
  @IsIP(undefined, { message: 'Invalid IP address' })
  @Expose()
  ipAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'AFID must not exceed 50 characters' })
  AFID?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'AFFID must not exceed 50 characters' })
  AFFID?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'SID must not exceed 50 characters' })
  SID?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'C1 must not exceed 50 characters' })
  C1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'C2 must not exceed 50 characters' })
  C2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'C3 must not exceed 50 characters' })
  C3?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'UTM campaign must not exceed 100 characters' })
  utm_campaign?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true, message: 'Each tag must not exceed 50 characters' })
  tags?: string[];

  // New properties
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Rotator ID must not exceed 50 characters' })
  rt_rotator_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Variation ID must not exceed 50 characters' })
  rt_variation_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Device must not exceed 50 characters' })
  device?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'GA4 Client ID must not exceed 100 characters' })
  ga4_client_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'GA4 Session ID must not exceed 100 characters' })
  ga4_session_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Funnel ID must not exceed 50 characters' })
  rt_funnel_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Variation path must not exceed 255 characters' })
  rt_variation_path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Step ID must not exceed 50 characters' })
  rt_step_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Facebook Click ID must not exceed 100 characters' })
  fbclid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Facebook Pixel ID must not exceed 100 characters' })
  fbpid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'User agent must not exceed 255 characters' })
  user_agent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Google Click ID must not exceed 100 characters' })
  gclid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'RT params must not exceed 255 characters' })
  rt_params?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Funnel name must not exceed 100 characters' })
  rt_funnel_name?: string;

  @IsOptional()
  @IsString()
  prospectId?: string;

  @IsOptional()
  @IsString()
  quiz_answers?: string;
}

