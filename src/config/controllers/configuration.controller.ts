import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, ValidationPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BulkConfigurationDto, CreateConfigurationDto, UpdateConfigurationDto } from '../dto/configuration.dto';
import { ConfigCategory, ConfigEnvironment, Configuration } from '../entities/configuration.entity';
import { ConfigurationService } from '../services/configuration.service';

/**
 * Union type for all supported configuration values
 * Provides type safety while maintaining flexibility
 */
type ConfigurationValue = string | number | boolean | null;

/**
 * Configuration Management Controller
 *
 * Provides REST API endpoints for managing application configuration.
 * Supports CRUD operations, bulk updates, and environment-specific settings.
 */
@ApiTags('Configuration')
@Controller('api/v1/config')
export class ConfigurationController {
  constructor(private readonly configService: ConfigurationService) {}

  /**
   * Get all configurations with optional filtering
   */
  @Get()
  @ApiOperation({
    summary: 'Get all configurations',
    description: 'Retrieve all configurations with optional filtering by category, environment, and active status.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ConfigCategory,
    description: 'Filter by configuration category',
  })
  @ApiQuery({
    name: 'environment',
    required: false,
    enum: ConfigEnvironment,
    description: 'Filter by environment (development, staging, production, all)',
  })
  @ApiQuery({
    name: 'active',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiOkResponse({
    description: 'List of configurations',
    type: [Configuration],
  })
  async getAll(
    @Query('category') category?: ConfigCategory,
    @Query('environment') environment?: ConfigEnvironment,
    @Query('active') active?: boolean,
  ): Promise<Configuration[]> {
    const configs = await this.configService.getAll({
      category,
      environment,
      isActive: active,
    });

    // Return sanitized versions that may redact secret values
    return configs.map((config) => config.toSafeObject() as Configuration);
  }

  /**
   * Get specific configuration by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get configuration by ID',
    description: 'Retrieve a specific configuration by its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'Configuration unique identifier',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Configuration details',
    type: Configuration,
  })
  @ApiNotFoundResponse({
    description: 'Configuration not found',
  })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<Configuration> {
    const config = await this.configService.getWithMetadata(id);
    return config.toSafeObject() as Configuration;
  }

  /**
   * Get configuration value by key
   */
  @Get('key/:key')
  @ApiOperation({
    summary: 'Get configuration by key',
    description: 'Retrieve configuration value by key with optional environment filtering.',
  })
  @ApiParam({
    name: 'key',
    description: 'Configuration key',
    type: 'string',
  })
  @ApiQuery({
    name: 'environment',
    required: false,
    enum: ConfigEnvironment,
    description: 'Environment context for the configuration',
  })
  @ApiOkResponse({
    description: 'Configuration value',
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
        type: { type: 'string' },
        environment: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Configuration not found',
  })
  async getByKey(
    @Param('key') key: string,
    @Query('environment') environment?: ConfigEnvironment,
  ): Promise<{ key: string; value: ConfigurationValue; type: string; environment: string }> {
    const value = await this.configService.get(key, environment);

    // Get the full config for metadata
    const config = await this.configService.getAll({
      environment,
    });

    const matchingConfig = config.find((c) => c.key === key);

    return {
      key,
      value,
      type: matchingConfig?.type || 'string',
      environment: environment || ConfigEnvironment.ALL,
    };
  }

  /**
   * Create new configuration
   */
  @Post()
  @ApiOperation({
    summary: 'Create configuration',
    description: 'Create a new configuration entry with validation rules and metadata.',
  })
  @ApiBody({
    description: 'Configuration data',
    type: CreateConfigurationDto,
  })
  @ApiCreatedResponse({
    description: 'Configuration created successfully',
    type: Configuration,
  })
  @ApiBadRequestResponse({
    description: 'Invalid configuration data',
  })
  async create(@Body(ValidationPipe) dto: CreateConfigurationDto): Promise<Configuration> {
    const config = await this.configService.set(dto);
    return config.toSafeObject() as Configuration;
  }

  /**
   * Update existing configuration
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update configuration',
    description: 'Update an existing configuration by ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Configuration unique identifier',
    type: 'string',
    format: 'uuid',
  })
  @ApiBody({
    description: 'Configuration update data',
    type: UpdateConfigurationDto,
  })
  @ApiOkResponse({
    description: 'Configuration updated successfully',
    type: Configuration,
  })
  @ApiNotFoundResponse({
    description: 'Configuration not found',
  })
  @ApiBadRequestResponse({
    description: 'Invalid configuration data',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(ValidationPipe) dto: UpdateConfigurationDto): Promise<Configuration> {
    const config = await this.configService.update(id, dto);
    return config.toSafeObject() as Configuration;
  }

  /**
   * Delete configuration
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete configuration',
    description: 'Permanently delete a configuration entry.',
  })
  @ApiParam({
    name: 'id',
    description: 'Configuration unique identifier',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Configuration deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Configuration not found',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    await this.configService.delete(id);
    return { message: 'Configuration deleted successfully' };
  }

  /**
   * Get configurations by category
   */
  @Get('category/:category')
  @ApiOperation({
    summary: 'Get configurations by category',
    description: 'Retrieve all configurations for a specific category.',
  })
  @ApiParam({
    name: 'category',
    enum: ConfigCategory,
    description: 'Configuration category',
  })
  @ApiQuery({
    name: 'environment',
    required: false,
    enum: ConfigEnvironment,
    description: 'Environment filter',
  })
  @ApiOkResponse({
    description: 'Configurations for the specified category',
    type: [Configuration],
  })
  async getByCategory(@Param('category') category: ConfigCategory, @Query('environment') environment?: ConfigEnvironment): Promise<Configuration[]> {
    const configs = await this.configService.getByCategory(category, environment);
    return configs.map((config) => config.toSafeObject() as Configuration);
  }

  /**
   * Get available categories
   */
  @Get('meta/categories')
  @ApiOperation({
    summary: 'Get available categories',
    description: 'Retrieve all available configuration categories.',
  })
  @ApiOkResponse({
    description: 'List of available categories',
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: Object.values(ConfigCategory),
      },
    },
  })
  async getCategories(): Promise<ConfigCategory[]> {
    return this.configService.getCategories();
  }

  /**
   * Bulk create/update configurations
   */
  @Post('bulk')
  @ApiOperation({
    summary: 'Bulk configuration operations',
    description: 'Create or update multiple configurations in a single operation.',
  })
  @ApiBody({
    description: 'Array of configuration data',
    type: BulkConfigurationDto,
  })
  @ApiCreatedResponse({
    description: 'Configurations processed successfully',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number' },
        updated: { type: 'number' },
        configurations: {
          type: 'array',
          items: { $ref: '#/components/schemas/Configuration' },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid bulk configuration data',
  })
  async bulkUpdate(@Body(ValidationPipe) dto: BulkConfigurationDto): Promise<{
    created: number;
    updated: number;
    configurations: Configuration[];
  }> {
    const results = await this.configService.bulkSet(dto.configurations);

    // Count created vs updated (simplified - in real implementation you'd track this)
    const created = results.filter((r) => r.version === 1).length;
    const updated = results.length - created;

    return {
      created,
      updated,
      configurations: results.map((config) => config.toSafeObject() as Configuration),
    };
  }

  /**
   * Validate configuration set
   */
  @Post('validate')
  @ApiOperation({
    summary: 'Validate configurations',
    description: 'Validate a set of configurations without saving them.',
  })
  @ApiBody({
    description: 'Array of configuration data to validate',
    type: BulkConfigurationDto,
  })
  @ApiOkResponse({
    description: 'Validation results',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async validate(@Body(ValidationPipe) dto: BulkConfigurationDto): Promise<{
    valid: boolean;
    errors: Array<{ key: string; error: string }>;
  }> {
    const errors: Array<{ key: string; error: string }> = [];

    for (const config of dto.configurations) {
      try {
        // This would validate without saving
        // For now, just check basic requirements
        if (!config.key || !config.value || !config.type) {
          errors.push({
            key: config.key || 'unknown',
            error: 'Missing required fields: key, value, or type',
          });
        }
      } catch (error) {
        errors.push({
          key: config.key,
          error: error instanceof Error ? error.message : 'Validation failed',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Reload configuration cache
   */
  @Post('cache/reload')
  @ApiOperation({
    summary: 'Reload configuration cache',
    description: 'Clear and reload the configuration cache for immediate effect of changes.',
  })
  @ApiOkResponse({
    description: 'Cache reloaded successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        reloadedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async reloadCache(): Promise<{ message: string; reloadedAt: string }> {
    await this.configService.reloadCache();
    return {
      message: 'Configuration cache reloaded successfully',
      reloadedAt: new Date().toISOString(),
    };
  }
}
