import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const API_SECURITY_METADATA_KEY = 'swagger/apiSecurity';

describe('DashboardController', () => {
  let controller: DashboardController;

  const mockDashboardService = {
    getSummary: jest.fn(),
    getUserStats: jest.fn(),
    getDocumentStats: jest.fn(),
    getStatistics: jest.fn(),
    getDocumentsBySubject: jest.fn(),
    getDocumentsByCategory: jest.fn(),
    getUploadStatistics: jest.fn(),
  };

  const mockFirebaseAuthGuard = { canActivate: jest.fn(() => true) };
  const mockRolesGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('declares bearer auth for Swagger requests', () => {
    expect(
      Reflect.getMetadata(API_SECURITY_METADATA_KEY, DashboardController),
    ).toEqual([{ bearer: [] }]);
  });

  describe('getSummary', () => {
    it('should call getSummary on service and return result', async () => {
      const mockResult = {
        totalUsers: 10,
        totalDocuments: 8,
        totalPublicDocuments: 5,
        totalPrivateDocuments: 3,
        totalChats: 12,
        totalDownloads: 15,
        message: 'Success',
      };
      mockDashboardService.getSummary.mockResolvedValue(mockResult);

      const result = await controller.getSummary();

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getSummary).toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('should call getUserStats on service and return result', async () => {
      const mockResult = { byRole: [], byStatus: [], message: 'Success' };
      mockDashboardService.getUserStats.mockResolvedValue(mockResult);

      const result = await controller.getUserStats();

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getUserStats).toHaveBeenCalled();
    });
  });

  describe('getDocumentStats', () => {
    it('should call getDocumentStats on service and return result', async () => {
      const mockResult = { byStatus: [], byVisibility: [], message: 'Success' };
      mockDashboardService.getDocumentStats.mockResolvedValue(mockResult);

      const result = await controller.getDocumentStats();

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getDocumentStats).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should call getStatistics on service and return result', async () => {
      const mockResult = {
        users: { byRole: [], byStatus: [] },
        documents: {
          byStatus: [],
          byVisibility: [],
          bySubject: [],
          byCategory: [],
        },
        message: 'Success',
      };
      mockDashboardService.getStatistics.mockResolvedValue(mockResult);

      const result = await controller.getStatistics();

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getStatistics).toHaveBeenCalled();
    });
  });

  describe('getDocumentsBySubject', () => {
    it('should call getDocumentsBySubject on service with query params', async () => {
      const query = { from: '2026-06-01' };
      const mockResult = { filters: query, data: [], message: 'Success' };
      mockDashboardService.getDocumentsBySubject.mockResolvedValue(mockResult);

      const result = await controller.getDocumentsBySubject(query);

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getDocumentsBySubject).toHaveBeenCalledWith(
        query,
      );
    });
  });

  describe('getDocumentsByCategory', () => {
    it('should call getDocumentsByCategory on service with query params', async () => {
      const query = { from: '2026-06-01' };
      const mockResult = { filters: query, data: [], message: 'Success' };
      mockDashboardService.getDocumentsByCategory.mockResolvedValue(mockResult);

      const result = await controller.getDocumentsByCategory(query);

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getDocumentsByCategory).toHaveBeenCalledWith(
        query,
      );
    });
  });

  describe('getUploadStatistics', () => {
    it('should call getUploadStatistics on service with query params', async () => {
      const query = { groupBy: 'day' as const };
      const mockResult = { filters: query, data: [], message: 'Success' };
      mockDashboardService.getUploadStatistics.mockResolvedValue(mockResult);

      const result = await controller.getUploadStatistics(query);

      expect(result).toBe(mockResult);
      expect(mockDashboardService.getUploadStatistics).toHaveBeenCalledWith(
        query,
      );
    });
  });
});
