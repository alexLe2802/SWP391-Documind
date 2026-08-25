import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ApiWrappedArrayOkResponse,
  ApiWrappedErrorResponses,
  ApiWrappedOkResponse,
} from '../common/swagger/api-wrapped-response.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import {
  CheckoutResponseDto,
  CurrentSubscriptionDto,
  PaymentOrderDto,
  SubscriptionPlanDto,
} from './dto/payment-response.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { PaymentsService } from './payments.service';

@ApiTags('subscription')
@Controller()
export class PaymentsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly paymentsService: PaymentsService) {}

  // Lấy dữ liệu gói dịch vụ.
  @Get('subscription/plans')
  @ApiOperation({ summary: 'List available subscription plans' })
  @ApiWrappedArrayOkResponse(
    SubscriptionPlanDto,
    'Available subscription plans.',
  )
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid Firebase bearer token.',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    },
  ])
  getPlans(): SubscriptionPlanDto[] {
    return this.paymentsService.getPlans();
  }

  // Lấy dữ liệu hiện tại quyền lợi.
  @Get('subscription/current')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user subscription' })
  @ApiWrappedOkResponse(CurrentSubscriptionDto, 'Current subscription state.')
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid Firebase bearer token.',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    },
  ])
  getCurrentSubscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CurrentSubscriptionDto> {
    return this.paymentsService.getCurrentSubscription(user.id);
  }

  // Tạo hoặc lưu đơn thanh toán.
  @Post('payments/checkout')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a signed SePay checkout form' })
  @ApiWrappedOkResponse(CheckoutResponseDto, 'SePay checkout initialized.')
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.BAD_REQUEST,
      description:
        'Invalid plan, invalid payment method, or Free plan checkout.',
      code: 'BAD_REQUEST',
      message: 'The Free plan does not require payment',
    },
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid Firebase bearer token.',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    },
    {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'SePay payment gateway is not configured.',
      code: 'SERVICE_UNAVAILABLE',
      message: 'SePay payment gateway is not configured',
    },
  ])
  createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.paymentsService.createCheckout(user, payload);
  }

  // Lấy dữ liệu thanh toán lịch sử.
  @Get('payments/history')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user payment history' })
  @ApiWrappedArrayOkResponse(PaymentOrderDto, 'Recent payment orders.')
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid Firebase bearer token.',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    },
  ])
  getPaymentHistory(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentOrderDto[]> {
    return this.paymentsService.getPaymentHistory(user.id);
  }

  // Lấy dữ liệu thanh toán.
  @Get('payments/:invoiceNumber')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one payment order status' })
  @ApiWrappedOkResponse(PaymentOrderDto, 'Payment order status.')
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.BAD_REQUEST,
      description: 'Gateway reconciliation returned mismatched order details.',
      code: 'BAD_REQUEST',
      message: 'SePay order detail does not match',
    },
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid Firebase bearer token.',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Payment order does not exist or belongs to another user.',
      code: 'NOT_FOUND',
      message: 'Payment order not found',
    },
  ])
  getPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceNumber') invoiceNumber: string,
  ): Promise<PaymentOrderDto> {
    return this.paymentsService.getPayment(user.id, invoiceNumber);
  }

  // Cập nhật thanh toán trạng thái.
  @Post('payments/:invoiceNumber/status')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a failed or cancelled checkout redirect',
  })
  @ApiWrappedOkResponse(PaymentOrderDto, 'Payment order status updated.')
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid status body. Only FAILED or CANCELLED is accepted.',
      code: 'BAD_REQUEST',
      message: 'Validation failed',
    },
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid Firebase bearer token.',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Payment order does not exist or belongs to another user.',
      code: 'NOT_FOUND',
      message: 'Payment order not found',
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'Paid payment orders cannot be changed.',
      code: 'CONFLICT',
      message: 'Paid payments cannot be changed',
    },
  ])
  updatePaymentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceNumber') invoiceNumber: string,
    @Body() payload: UpdatePaymentStatusDto,
  ): Promise<PaymentOrderDto> {
    return this.paymentsService.updatePaymentStatus(
      user.id,
      invoiceNumber,
      payload,
    );
  }

  // Xử lý ipn.
  @Post('payments/sepay/ipn')
  @ApiOperation({ summary: 'Receive SePay payment and bank webhooks' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook acknowledged.',
    schema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @ApiWrappedErrorResponses([
    {
      status: HttpStatus.BAD_REQUEST,
      description:
        'Unsupported webhook payload, payment mismatch, or bank webhook method mismatch.',
      code: 'BAD_REQUEST',
      message: 'Unsupported SePay webhook payload',
    },
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or invalid SePay webhook API key.',
      code: 'UNAUTHORIZED',
      message: 'Invalid SePay webhook API key',
    },
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Payment notification is not approved by SePay.',
      code: 'FORBIDDEN',
      message: 'Payment is not approved',
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Webhook references a payment order that does not exist.',
      code: 'NOT_FOUND',
      message: 'Payment order not found',
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'SePay transaction was already processed for another order.',
      code: 'CONFLICT',
      message: 'SePay transaction already processed',
    },
  ])
  async processIpn(
    @Headers('authorization') authorization: string | undefined,
    @Body() payload: unknown,
    @Res() response: Response,
  ): Promise<void> {
    await this.paymentsService.processWebhook(authorization, payload);
    response.status(HttpStatus.OK).json({ success: true });
  }
}
