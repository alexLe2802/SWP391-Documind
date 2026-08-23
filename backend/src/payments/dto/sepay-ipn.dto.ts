import { Type } from 'class-transformer';
import {
  Allow,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class SepayIpnOrderDto {
  @IsString()
  id!: string;

  @IsString()
  order_id!: string;

  @IsString()
  order_status!: string;

  @IsString()
  order_currency!: string;

  @IsString()
  order_amount!: string;

  @IsString()
  order_invoice_number!: string;

  @Allow()
  custom_data?: unknown;

  @IsOptional()
  @IsString()
  order_description?: string;

  @IsOptional()
  @IsString()
  user_agent?: string;

  @IsOptional()
  @IsString()
  ip_address?: string;
}

class SepayIpnTransactionDto {
  @IsString()
  id!: string;

  @IsString()
  payment_method!: string;

  @IsString()
  transaction_id!: string;

  @IsString()
  transaction_type!: string;

  @IsString()
  transaction_date!: string;

  @IsString()
  transaction_status!: string;

  @IsString()
  transaction_amount!: string;

  @IsString()
  transaction_currency!: string;

  @IsOptional()
  @IsString()
  authentication_status?: string;

  @Allow()
  card_number?: unknown;

  @Allow()
  card_holder_name?: unknown;

  @Allow()
  card_expiry?: unknown;

  @Allow()
  card_funding_method?: unknown;

  @Allow()
  card_brand?: unknown;
}

export class SepayIpnDto {
  @IsInt()
  timestamp!: number;

  @IsString()
  notification_type!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SepayIpnOrderDto)
  order!: SepayIpnOrderDto;

  @IsObject()
  @ValidateNested()
  @Type(() => SepayIpnTransactionDto)
  transaction!: SepayIpnTransactionDto;

  @Allow()
  customer?: unknown;

  @Allow()
  agreement?: unknown;
}
