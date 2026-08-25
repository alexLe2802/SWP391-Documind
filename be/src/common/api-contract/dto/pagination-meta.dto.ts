import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from '../api-contract.types';

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;

  @ApiProperty({ minimum: 0 })
  totalItems!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;

  @ApiProperty()
  hasNext!: boolean;

  @ApiProperty()
  hasPrevious!: boolean;
}
