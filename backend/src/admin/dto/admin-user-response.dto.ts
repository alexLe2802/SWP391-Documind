import { ApiProperty } from '@nestjs/swagger';
import {
  AuthProvider,
  RoleName,
  UserStatus,
} from '../../generated/prisma/client';

export class AdminUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  firebaseUid!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: AuthProvider })
  authProvider!: AuthProvider;

  @ApiProperty({ enum: RoleName })
  role!: RoleName;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ nullable: true, format: 'date-time' })
  lastLogin!: string | null;
}

class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;

  @ApiProperty()
  hasNext!: boolean;

  @ApiProperty()
  hasPrevious!: boolean;
}

export class AdminUsersResponseDto {
  @ApiProperty({ type: [AdminUserResponseDto] })
  items!: AdminUserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
