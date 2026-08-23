import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CurrentSubscriptionResponseDto } from './dto/current-subscription-response.dto';
import { SubscriptionPlanResponseDto } from './dto/subscription-plan-response.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@ApiExtraModels(SubscriptionPlanResponseDto, CurrentSubscriptionResponseDto)
@Controller('subscription')
export class SubscriptionController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Lấy dữ liệu gói dịch vụ.
  @Get('plans')
  @ApiOperation({ summary: 'List mock subscription plans' })
  @ApiOkResponse({
    description: 'Mock subscription plans.',
    schema: {
      type: 'object',
      required: ['success', 'data', 'timestamp'],
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(SubscriptionPlanResponseDto) },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getPlans(): SubscriptionPlanResponseDto[] {
    return this.subscriptionService.getPlans();
  }

  // Lấy dữ liệu quyền lợi hiện tại.
  @Get('current')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current mock subscription' })
  @ApiOkResponse({
    description: 'Current mock subscription.',
    schema: {
      type: 'object',
      required: ['success', 'data', 'timestamp'],
      properties: {
        success: { type: 'boolean', example: true },
        data: { $ref: getSchemaPath(CurrentSubscriptionResponseDto) },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getCurrentSubscription(): CurrentSubscriptionResponseDto {
    return this.subscriptionService.getCurrentSubscription();
  }
}
