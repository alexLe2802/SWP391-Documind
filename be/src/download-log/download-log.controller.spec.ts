import { Test, TestingModule } from '@nestjs/testing';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DownloadLogController } from './download-log.controller';
import { DownloadLogService } from './download-log.service';

const API_SECURITY_METADATA_KEY = 'swagger/apiSecurity';

describe('DownloadLogController', () => {
  let controller: DownloadLogController;

  const mockDownloadLogService = {
    findAll: jest.fn(),
  };

  const mockFirebaseAuthGuard = { canActivate: jest.fn(() => true) };
  const mockRolesGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DownloadLogController],
      providers: [
        {
          provide: DownloadLogService,
          useValue: mockDownloadLogService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<DownloadLogController>(DownloadLogController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('declares bearer auth for Swagger requests', () => {
    expect(
      Reflect.getMetadata(API_SECURITY_METADATA_KEY, DownloadLogController),
    ).toEqual([{ bearer: [] }]);
  });

  it('should call findAll on service and return result', async () => {
    const mockResult = {
      filters: { page: 1, limit: 10 },
      data: [],
      pagination: { page: 1, limit: 10, total: 0 },
      message: 'Success',
    };
    mockDownloadLogService.findAll.mockResolvedValue(mockResult);

    const result = await controller.findAll({ page: 1, limit: 10 });

    expect(result).toBe(mockResult);
    expect(mockDownloadLogService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
  });
});
