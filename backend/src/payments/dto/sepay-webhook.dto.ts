import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SepayWebhookDto {
  @ApiProperty({
    description: 'Unique transaction log ID from SEPay',
    example: 123456,
  })
  @IsNotEmpty()
  id!: number;

  @ApiProperty({
    description: 'Payment gateway bank code',
    example: 'MBBank',
  })
  @IsString()
  @IsNotEmpty()
  gateway!: string;

  @ApiProperty({
    description: 'Timestamp of the transaction',
    example: '2026-06-23 11:20:00',
  })
  @IsString()
  @IsOptional()
  transactionDate?: string;

  @ApiProperty({
    description: 'Transaction amount received',
    example: 349000,
  })
  @IsNumber()
  @IsNotEmpty()
  amount!: number;

  @ApiProperty({
    description:
      'Transaction description containing the unique transaction code',
    example: 'DM123456 thanh toan pro',
  })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiProperty({
    description: 'Bank reference / transaction code',
    example: 'FT23123456789',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'Transaction transfer direction: in or out',
    example: 'in',
  })
  @IsString()
  @IsNotEmpty()
  transferType!: string;

  @ApiProperty({
    description: 'Sub-account number of the receiving bank',
    example: '0123456789',
  })
  @IsString()
  @IsOptional()
  subAccount?: string;
}
