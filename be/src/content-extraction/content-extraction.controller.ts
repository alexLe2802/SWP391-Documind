import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ContentExtractionService } from './content-extraction.service';
import { ExtractionResponseDto } from './dto/extraction-response.dto';
import {
  EXTRACTION_UPLOAD_MAX_SIZE,
  ExtractionFileValidationPipe,
} from './extraction-file-validation.pipe';
import { UploadedContentFile } from './interfaces/uploaded-file.interface';

@ApiTags('Content Extraction')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('content-extraction')
export class ContentExtractionController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: ContentExtractionService) {}

  // Thực hiện chức năng test.
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test content extraction with file upload' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: ExtractionResponseDto })
  @ApiBadRequestResponse({ description: 'Missing or unsupported file' })
  @ApiResponse({ status: 413, description: 'File exceeds the 10 MB limit' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: EXTRACTION_UPLOAD_MAX_SIZE },
    }),
  )
  test(
    @UploadedFile(ExtractionFileValidationPipe) file: UploadedContentFile,
  ): Promise<ExtractionResponseDto> {
    return this.service.extractFromFile(file);
  }
}
