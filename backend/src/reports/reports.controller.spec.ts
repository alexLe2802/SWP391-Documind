import { Test, TestingModule } from '@nestjs/testing';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

const API_SECURITY_METADATA_KEY = 'swagger/apiSecurity';

describe('ReportsController', () => {
  let controller: ReportsController;

  const mockReportsService = {
    getUploadStatistics: jest.fn(),
    getMostDownloaded: jest.fn(),
    getMostSaved: jest.fn(),
  };

  const mockFirebaseAuthGuard = { canActivate: jest.fn(() => true) };
  const mockRolesGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('declares bearer auth for Swagger requests', () => {
    expect(
      Reflect.getMetadata(API_SECURITY_METADATA_KEY, ReportsController),
    ).toEqual([{ bearer: [] }]);
  });

  it('gets upload statistics', async () => {
    const query = { groupBy: 'day' as const };
    const response = {
      filters: query,
      data: [],
      message: 'Upload statistics retrieved successfully',
    };
    mockReportsService.getUploadStatistics.mockResolvedValue(response);

    await expect(controller.getUploadStatistics(query)).resolves.toBe(response);
    expect(mockReportsService.getUploadStatistics).toHaveBeenCalledWith(query);
  });

  it('gets most downloaded documents', async () => {
    const query = { limit: 5 };
    const response = {
      filters: query,
      data: [],
      message: 'Most downloaded documents retrieved successfully',
    };
    mockReportsService.getMostDownloaded.mockResolvedValue(response);

    await expect(controller.getMostDownloaded(query)).resolves.toBe(response);
    expect(mockReportsService.getMostDownloaded).toHaveBeenCalledWith(query);
  });

  it('gets most saved documents', async () => {
    const query = { limit: 5 };
    const response = {
      filters: query,
      data: [],
      message: 'Most saved documents retrieved successfully',
    };
    mockReportsService.getMostSaved.mockResolvedValue(response);

    await expect(controller.getMostSaved(query)).resolves.toBe(response);
    expect(mockReportsService.getMostSaved).toHaveBeenCalledWith(query);
  });
});
