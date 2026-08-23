import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const API_SECURITY_METADATA_KEY = 'swagger/apiSecurity';

describe('AuditLogController', () => {
  let controller: AuditLogController;

  const mockAuditLogService = {
    findAll: jest.fn(),
  };

  const mockFirebaseAuthGuard = { canActivate: jest.fn(() => true) };
  const mockRolesGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<AuditLogController>(AuditLogController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('declares bearer auth for Swagger requests', () => {
    expect(
      Reflect.getMetadata(API_SECURITY_METADATA_KEY, AuditLogController),
    ).toEqual([{ bearer: [] }]);
  });

  describe('findAll', () => {
    it('should call findAll on service and return result', async () => {
      const mockResult = {
        filters: { page: 1, limit: 10 },
        data: [],
        pagination: { page: 1, limit: 10, total: 0 },
        message: 'Success',
      };
      mockAuditLogService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result).toBe(mockResult);
      expect(mockAuditLogService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
    });
  });
});
