import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Health status enumeration for consistent status reporting
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * DTO for individual service health information
 */
export class ServiceHealthDto {
  @ApiProperty({
    description: 'Name of the service',
    example: 'PostgreSQL',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Health status of the service',
    enum: HealthStatus,
    example: HealthStatus.HEALTHY,
  })
  @IsEnum(HealthStatus)
  status!: HealthStatus;

  @ApiPropertyOptional({
    description: 'Optional message describing the service status',
    example: 'Connected and responsive',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Additional details about the service health',
    type: 'object',
    additionalProperties: true,
    example: { connections: 5, uptime: 3600 },
  })
  @IsOptional()
  details?: Record<string, unknown>;
}

/**
 * DTO for overall system health status
 */
export class SystemHealthDto {
  @ApiProperty({
    description: 'Overall system health status',
    enum: HealthStatus,
    example: HealthStatus.HEALTHY,
  })
  @IsEnum(HealthStatus)
  status!: HealthStatus;

  @ApiProperty({
    description: 'Timestamp when health check was performed',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsString()
  timestamp!: string;

  @ApiProperty({
    description: 'System uptime in milliseconds',
    example: 1800000,
    minimum: 0,
  })
  @IsNumber()
  uptime!: number;

  @ApiProperty({
    description: 'Health status of individual services',
    type: [ServiceHealthDto],
    isArray: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceHealthDto)
  services!: ServiceHealthDto[];

  @ApiPropertyOptional({
    description: 'Actions required to address health issues',
    type: [String],
    example: ['Configure Infisical secrets', 'Check Qdrant connection'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredActions?: string[];
}

/**
 * DTO for readiness probe response
 */
export class ReadinessDto {
  @ApiProperty({
    description: 'Readiness status',
    example: 'ready',
  })
  @IsString()
  status!: string;
}

/**
 * DTO for liveness probe response
 */
export class LivenessDto {
  @ApiProperty({
    description: 'Liveness status',
    example: 'alive',
  })
  @IsString()
  status!: string;

  @ApiProperty({
    description: 'Timestamp when liveness check was performed',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsString()
  timestamp!: string;
}

/**
 * DTO for startup/initialization report response
 */
export class InitializationReportDto {
  @ApiProperty({
    description: 'Overall initialization status',
    example: 'completed',
  })
  @IsString()
  status!: string;

  @ApiProperty({
    description: 'Timestamp when initialization started',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsString()
  startedAt!: string;

  @ApiProperty({
    description: 'Timestamp when initialization completed',
    example: '2024-01-01T12:00:05.000Z',
    type: 'string',
    format: 'date-time',
  })
  @IsString()
  completedAt!: string;

  @ApiProperty({
    description: 'Duration of initialization in milliseconds',
    example: 5000,
    minimum: 0,
  })
  @IsNumber()
  duration!: number;

  @ApiPropertyOptional({
    description: 'Actions required to complete initialization',
    type: [String],
    example: ['Configure database connection', 'Load initial data'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredActions?: string[];

  @ApiPropertyOptional({
    description: 'Detailed initialization steps and their status',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  steps?: Record<string, unknown>;
}
