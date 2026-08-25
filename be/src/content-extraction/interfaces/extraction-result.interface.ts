export type ExtractionStatus = 'COMPLETED' | 'MOCKED' | 'FAILED';
export type ExtractionQuality = 'READY' | 'PARTIAL' | 'UNREADABLE';

export interface ExtractionResult {
  fileName: string;
  fileType: string;
  extractionStatus: ExtractionStatus;
  extractedText: string;
  contentSummary: string;
  extractedAt: string;
  qualityStatus: ExtractionQuality;
  qualityDetails: string[];
  errorMessage?: string;
}
