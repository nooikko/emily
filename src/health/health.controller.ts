import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InternalServerErrorDto, ServiceUnavailableErrorDto } from '../common/dto/error.dto';
import { InfisicalService } from '../infisical/infisical.service';
import { InitializationService } from '../initialization/initialization.service';
import { RedisService } from '../messaging/redis/redis.service';
import { StructuredLoggerService } from '../observability/services/structured-logger.service';
import { QdrantService } from '../vectors/services/qdrant.service';
import { HealthStatus, InitializationReportDto, LivenessDto, ReadinessDto, ServiceHealthDto, SystemHealthDto } from './dto/health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new StructuredLoggerService(HealthController.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly initializationService: InitializationService,
    private readonly infisicalService: InfisicalService,
    private readonly redisService: RedisService,
    private readonly qdrantService: QdrantService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get overall system health',
    description: 'Retrieve comprehensive system health status including all service dependencies',
  })
  @ApiResponse({
    status: 200,
    description: 'System health status retrieved successfully',
    type: SystemHealthDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during health check',
    type: InternalServerErrorDto,
  })
  async getHealth(): Promise<SystemHealthDto> {
    this.logger.logDebug('Health check requested');
    const services: ServiceHealthDto[] = [];
    let overallStatus: HealthStatus = HealthStatus.HEALTHY;

    // Check database
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        services.push({
          name: 'PostgreSQL',
          status: HealthStatus.HEALTHY,
          message: 'Connected and responsive',
        });
      } else {
        services.push({
          name: 'PostgreSQL',
          status: HealthStatus.UNHEALTHY,
          message: 'Not initialized',
        });
        overallStatus = HealthStatus.UNHEALTHY;
      }
    } catch (error) {
      this.logger.logError('PostgreSQL health check failed', error);
      services.push({
        name: 'PostgreSQL',
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
      overallStatus = HealthStatus.UNHEALTHY;
    }

    // Check Redis
    try {
      await this.redisService.ping();
      services.push({
        name: 'Redis',
        status: HealthStatus.HEALTHY,
        message: 'Connected and responsive',
      });
    } catch (error) {
      this.logger.logError('Redis health check failed', error);
      services.push({
        name: 'Redis',
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
      overallStatus = HealthStatus.UNHEALTHY;
    }

    // Check Qdrant
    try {
      const collections = await this.qdrantService.client.getCollections();
      services.push({
        name: 'Qdrant',
        status: HealthStatus.HEALTHY,
        message: `Connected, ${collections.collections.length} collections`,
      });
    } catch (error) {
      this.logger.logWarn('Qdrant health check failed - service degraded', {
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
      services.push({
        name: 'Qdrant',
        status: HealthStatus.DEGRADED,
        message: 'Not available - vector search disabled',
      });
      if (overallStatus === HealthStatus.HEALTHY) {
        overallStatus = HealthStatus.DEGRADED;
      }
    }

    // Check Infisical
    if (this.infisicalService.isReady()) {
      services.push({
        name: 'Infisical',
        status: HealthStatus.HEALTHY,
        message: 'Connected and ready',
      });
    } else {
      services.push({
        name: 'Infisical',
        status: HealthStatus.DEGRADED,
        message: 'Not configured - using environment variables',
      });
      if (overallStatus === HealthStatus.HEALTHY) {
        overallStatus = HealthStatus.DEGRADED;
      }
    }

    // Get initialization report if available
    const initReport = this.initializationService.getInitializationStatus();
    const requiredActions = initReport.requiredActions.length > 0 ? initReport.requiredActions : undefined;

    const healthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      services,
      requiredActions,
    };

    this.logger.logInfo('Health check completed', {
      metadata: {
        status: overallStatus,
        healthyServices: services.filter((s) => s.status === 'healthy').length,
        degradedServices: services.filter((s) => s.status === 'degraded').length,
        unhealthyServices: services.filter((s) => s.status === 'unhealthy').length,
      },
    });

    return healthStatus;
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe for Kubernetes',
    description: 'Check if the service is ready to accept requests by verifying critical dependencies',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to accept requests',
    type: ReadinessDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Service is not ready - critical dependencies unavailable',
    type: ServiceUnavailableErrorDto,
  })
  async getReadiness(): Promise<ReadinessDto> {
    // Check if critical services are ready
    try {
      await this.dataSource.query('SELECT 1');
      await this.redisService.ping();
      return { status: 'ready' };
    } catch (error) {
      this.logger.logError('Readiness probe failed', error);
      throw new HttpException(
        {
          statusCode: 503,
          message: 'Service not ready',
          error: 'Service Unavailable',
          timestamp: new Date().toISOString(),
          path: '/health/ready',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe for Kubernetes',
    description: 'Basic liveness check indicating the service process is running',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is alive and responding',
    type: LivenessDto,
  })
  getLiveness(): LivenessDto {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  @Get('startup')
  @ApiOperation({
    summary: 'Get detailed startup/initialization report',
    description: 'Retrieve comprehensive initialization status and metrics for troubleshooting startup issues',
  })
  @ApiResponse({
    status: 200,
    description: 'Initialization report retrieved successfully',
    type: InitializationReportDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while retrieving startup report',
    type: InternalServerErrorDto,
  })
  getStartupReport(): InitializationReportDto {
    const report = this.initializationService.getInitializationStatus();
    return {
      status: report.overallStatus,
      startedAt: report.timestamp.toISOString(),
      completedAt: report.timestamp.toISOString(),
      duration: 0, // Duration not tracked in InitializationReport
      requiredActions: report.requiredActions,
    };
  }
}
