import { ApiProperty } from '@nestjs/swagger';
import {
  AuthProvider,
  RoleName,
  UserStatus,
} from '../../generated/prisma/client';

export class CurrentUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  roleId!: string;

  @ApiProperty()
  firebaseUid!: string;

  @ApiProperty({ enum: AuthProvider })
  authProvider!: AuthProvider;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

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

export class AuthLoginResponseDto {
  @ApiProperty({ type: CurrentUserResponseDto })
  user!: CurrentUserResponseDto;

  @ApiProperty({ enum: RoleName })
  role!: RoleName;

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty()
  isNewUser!: boolean;
}

export class AuthMeResponseDto {
  @ApiProperty({ type: CurrentUserResponseDto })
  user!: CurrentUserResponseDto;

  @ApiProperty({ enum: RoleName })
  role!: RoleName;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}
