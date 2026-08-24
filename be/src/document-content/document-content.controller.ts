import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { ContentExtractionService } from '../content-extraction/content-extraction.service';
import { DocumentContentResponseDto } from './dto/document-content-response.dto';
import { ExtractionJobResponseDto } from './dto/extraction-job-response.dto';
import { ExtractionStatusResponseDto } from './dto/extraction-status-response.dto';

@ApiTags('Document Content')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('documents/:id')
export class DocumentContentController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: ContentExtractionService) {}

  // Xử lý extract.
  @Post('extract')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: ExtractionJobResponseDto })
  @ApiOperation({ summary: 'Queue document content extraction' })
  extract(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExtractionJobResponseDto> {
    return this.service.startExtraction(id, user);
  }

  // Lấy dữ liệu nội dung.
  @Get('content')
  @ApiOkResponse({ type: DocumentContentResponseDto })
  @ApiOperation({ summary: 'Get extracted document content' })
  getContent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentContentResponseDto> {
    return this.service.getDocumentContent(id, user);
  }

  // Lấy dữ liệu trạng thái.
  @Get('extraction-status')
  @ApiOkResponse({ type: ExtractionStatusResponseDto })
  @ApiOperation({ summary: 'Get document extraction status' })
  getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExtractionStatusResponseDto> {
    return this.service.getExtractionStatus(id, user);
  }
}
