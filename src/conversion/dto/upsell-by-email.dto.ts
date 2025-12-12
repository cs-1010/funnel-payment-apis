import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class UpsellByEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  offerId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;
}


