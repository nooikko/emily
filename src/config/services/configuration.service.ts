import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { type ConfigCategory, ConfigEnvironment, ConfigType, Configuration } from '../entities/configuration.entity';
import { ConfigurationRepository } from '../repositories/configuration.repository';

/**
 * Configuration cache entry with TTL
 */
interface CacheEntry {
  value: Configuration;
  expiresAt: number;
}

/**
 * Configuration creation/update data transfer object
 */
export interface ConfigurationDto {
  category: ConfigCategory;
  key: string;
  value: string;
  type: ConfigType;
  environment?: ConfigEnvironment;
  description?: string;
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
    required?: boolean;
  };
  isSecret?: boolean;
  isActive?: boolean;
  updatedBy?: string;
}

/**
 * Configuration Service
 *
 * Provides centralized configuration management with caching, validation,
 * and fallback to environment variables. Supports runtime configuration
 * updates without application restarts.
 */
@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly repository: ConfigurationRepository,
    private readonly nestConfigService: NestConfigService,
  ) {}

  /**
   * Get configuration value with fallback to environment variables
   */
  async get<T = string>(key: string, environment: ConfigEnvironment = ConfigEnvironment.ALL, defaultValue?: T): Promise<T> {
    try {
      // Try to get from database first
      const config = await this.getFromDatabase(key, environment);

      if (config) {
        return config.getTypedValue() as T;
      }

      // Fallback to environment variable
      const envValue = this.nestConfigService.get(key, defaultValue);

      if (envValue !== undefined) {
        this.logger.debug(`Using environment variable for ${key}`);
        return envValue as T;
      }

      // Return default if provided
      if (defaultValue !== undefined) {
        this.logger.debug(`Using default value for ${key}`);
        return defaultValue;
      }

      throw new NotFoundException(`Configuration not found: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to get configuration ${key}:`, error);

      // In case of error, try environment variable as last resort
      const envValue = this.nestConfigService.get(key, defaultValue);
      if (envValue !== undefined) {
        return envValue as T;
      }

      throw error;
    }
  }

  /**
   * Get boolean configuration value
   */
  async getBoolean(key: string, environment?: ConfigEnvironment, defaultValue?: boolean): Promise<boolean> {
    return this.get<boolean>(key, environment, defaultValue);
  }

  /**
   * Get number configuration value
   */
  async getNumber(key: string, environment?: ConfigEnvironment, defaultValue?: number): Promise<number> {
    return this.get<number>(key, environment, defaultValue);
  }

  /**
   * Get string configuration value
   */
  async getString(key: string, environment?: ConfigEnvironment, defaultValue?: string): Promise<string> {
    return this.get<string>(key, environment, defaultValue);
  }

  /**
   * Get configuration from database with caching
   */
  private async getFromDatabase(key: string, environment: ConfigEnvironment): Promise<Configuration | null> {
    const cacheKey = `${key}:${environment}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Fetch from database
    const config = await this.repository.findByKey(key, environment);

    if (config) {
      // Cache the result
      this.cache.set(cacheKey, {
        value: config,
        expiresAt: Date.now() + this.cacheTimeout,
      });
    }

    return config;
  }

  /**
   * Set configuration value
   */
  async set(dto: ConfigurationDto): Promise<Configuration> {
    // Validate the configuration
    this.validateConfiguration(dto);

    // Check if configuration exists
    const existing = await this.repository.findByKey(dto.key, dto.environment || ConfigEnvironment.ALL);

    let result: Configuration;

    if (existing) {
      // Update existing configuration
      result = (await this.repository.update(existing.id, {
        value: dto.value,
        type: dto.type,
        description: dto.description,
        validationRules: dto.validationRules,
        isSecret: dto.isSecret,
        isActive: dto.isActive,
        updatedBy: dto.updatedBy,
      })) as Configuration;
    } else {
      // Create new configuration
      result = await this.repository.create({
        ...dto,
        environment: dto.environment || ConfigEnvironment.ALL,
        isSecret: dto.isSecret || false,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      });
    }

    // Clear cache
    this.clearCache(dto.key, dto.environment || ConfigEnvironment.ALL);

    this.logger.log(`Configuration ${existing ? 'updated' : 'created'}: ${dto.key}`);
    return result;
  }

  /**
   * Update configuration value
   */
  async update(id: string, updates: Partial<ConfigurationDto>): Promise<Configuration> {
    const config = await this.repository.findById(id);

    if (!config) {
      throw new NotFoundException(`Configuration not found: ${id}`);
    }

    // Validate updates if value or validation rules changed
    if (updates.value || updates.validationRules) {
      this.validateConfiguration({
        ...config,
        ...updates,
      } as ConfigurationDto);
    }

    const result = await this.repository.update(id, updates);

    if (!result) {
      throw new Error('Failed to update configuration');
    }

    // Clear cache
    this.clearCache(config.key, config.environment);

    this.logger.log(`Configuration updated: ${config.key}`);
    return result;
  }

  /**
   * Delete configuration
   */
  async delete(id: string): Promise<void> {
    const config = await this.repository.findById(id);

    if (!config) {
      throw new NotFoundException(`Configuration not found: ${id}`);
    }

    await this.repository.delete(id);

    // Clear cache
    this.clearCache(config.key, config.environment);

    this.logger.log(`Configuration deleted: ${config.key}`);
  }

  /**
   * Get all configurations with filtering
   */
  async getAll(filters?: { category?: ConfigCategory; environment?: ConfigEnvironment; isActive?: boolean }): Promise<Configuration[]> {
    return this.repository.findAll(filters);
  }

  /**
   * Get configurations by category
   */
  async getByCategory(category: ConfigCategory, environment?: ConfigEnvironment): Promise<Configuration[]> {
    return this.repository.findByCategory(category, environment);
  }

  /**
   * Get available categories
   */
  async getCategories(): Promise<ConfigCategory[]> {
    return this.repository.getCategories();
  }

  /**
   * Bulk create/update configurations
   */
  async bulkSet(configs: ConfigurationDto[]): Promise<Configuration[]> {
    const results: Configuration[] = [];

    for (const dto of configs) {
      try {
        const result = await this.set(dto);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to set bulk configuration ${dto.key}:`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Clear configuration cache
   */
  clearCache(key?: string, environment?: ConfigEnvironment): void {
    if (key && environment) {
      const cacheKey = `${key}:${environment}`;
      this.cache.delete(cacheKey);
      this.logger.debug(`Cache cleared for ${cacheKey}`);
    } else {
      this.cache.clear();
      this.logger.debug('All configuration cache cleared');
    }
  }

  /**
   * Reload configuration cache
   */
  async reloadCache(): Promise<void> {
    this.clearCache();
    this.logger.log('Configuration cache reloaded');
  }

  /**
   * Validate configuration data
   */
  private validateConfiguration(dto: ConfigurationDto): void {
    if (!dto.key || !dto.value || !dto.type) {
      throw new BadRequestException('Key, value, and type are required');
    }

    // Type-specific validation
    switch (dto.type) {
      case ConfigType.BOOLEAN:
        if (dto.value !== 'true' && dto.value !== 'false') {
          throw new BadRequestException('Boolean configuration must be "true" or "false"');
        }
        break;

      case ConfigType.NUMBER:
        if (Number.isNaN(Number.parseFloat(dto.value))) {
          throw new BadRequestException('Number configuration must be a valid number');
        }
        break;

      case ConfigType.ENUM:
        if (dto.validationRules?.enum && !dto.validationRules.enum.includes(dto.value)) {
          throw new BadRequestException(`Enum configuration must be one of: ${dto.validationRules.enum.join(', ')}`);
        }
        break;
    }

    // Validation rules check
    if (dto.validationRules) {
      const tempConfig = new Configuration();
      Object.assign(tempConfig, dto);

      if (!tempConfig.validateValue()) {
        throw new BadRequestException('Configuration value does not meet validation rules');
      }
    }
  }

  /**
   * Get configuration with metadata
   */
  async getWithMetadata(id: string): Promise<Configuration> {
    const config = await this.repository.findById(id);

    if (!config) {
      throw new NotFoundException(`Configuration not found: ${id}`);
    }

    return config;
  }

  /**
   * Check if configuration exists
   */
  async exists(key: string, environment: ConfigEnvironment = ConfigEnvironment.ALL): Promise<boolean> {
    return this.repository.exists(key, environment);
  }
}
