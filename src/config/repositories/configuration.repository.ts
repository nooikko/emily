import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { type ConfigCategory, ConfigEnvironment, Configuration } from '../entities/configuration.entity';

/**
 * Configuration Repository
 *
 * Provides data access layer for configuration management with optimized
 * queries for common patterns like category filtering and environment scoping.
 */
@Injectable()
export class ConfigurationRepository {
  constructor(
    @InjectRepository(Configuration)
    private readonly repository: Repository<Configuration>,
  ) {}

  /**
   * Find all configurations with optional filtering
   */
  async findAll(filters?: { category?: ConfigCategory; environment?: ConfigEnvironment; isActive?: boolean }): Promise<Configuration[]> {
    const whereConditions: FindOptionsWhere<Configuration> = {};

    if (filters?.category) {
      whereConditions.category = filters.category;
    }

    if (filters?.environment) {
      whereConditions.environment = filters.environment;
    }

    if (filters?.isActive !== undefined) {
      whereConditions.isActive = filters.isActive;
    }

    return this.repository.find({
      where: whereConditions,
      order: {
        category: 'ASC',
        key: 'ASC',
      },
    });
  }

  /**
   * Find configuration by key and environment
   */
  async findByKey(key: string, environment: ConfigEnvironment = ConfigEnvironment.ALL): Promise<Configuration | null> {
    // First try to find environment-specific config
    let config = await this.repository.findOne({
      where: { key, environment, isActive: true },
    });

    // If not found and environment is not ALL, try to find ALL environment config
    if (!config && environment !== ConfigEnvironment.ALL) {
      config = await this.repository.findOne({
        where: { key, environment: ConfigEnvironment.ALL, isActive: true },
      });
    }

    return config;
  }

  /**
   * Find configurations by category
   */
  async findByCategory(category: ConfigCategory, environment?: ConfigEnvironment): Promise<Configuration[]> {
    const whereConditions: FindOptionsWhere<Configuration> = {
      category,
      isActive: true,
    };

    if (environment) {
      whereConditions.environment = environment;
    }

    return this.repository.find({
      where: whereConditions,
      order: { key: 'ASC' },
    });
  }

  /**
   * Create new configuration
   */
  async create(configData: Partial<Configuration>): Promise<Configuration> {
    const config = this.repository.create(configData);
    return this.repository.save(config);
  }

  /**
   * Update existing configuration by ID
   */
  async update(id: string, updates: Partial<Configuration>): Promise<Configuration | null> {
    const config = await this.repository.findOne({ where: { id } });

    if (!config) {
      return null;
    }

    // Increment version on updates
    const updatedConfig = this.repository.merge(config, {
      ...updates,
      version: config.version + 1,
    });

    return this.repository.save(updatedConfig);
  }

  /**
   * Update configuration by key and environment
   */
  async updateByKey(key: string, environment: ConfigEnvironment, updates: Partial<Configuration>): Promise<Configuration | null> {
    const config = await this.findByKey(key, environment);

    if (!config) {
      return null;
    }

    return this.update(config.id, updates);
  }

  /**
   * Delete configuration by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Soft delete by setting isActive to false
   */
  async softDelete(id: string): Promise<boolean> {
    const result = await this.update(id, { isActive: false });
    return result !== null;
  }

  /**
   * Find configuration by ID
   */
  async findById(id: string): Promise<Configuration | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Check if configuration exists by key and environment
   */
  async exists(key: string, environment: ConfigEnvironment): Promise<boolean> {
    const count = await this.repository.count({
      where: { key, environment },
    });
    return count > 0;
  }

  /**
   * Bulk create configurations
   */
  async bulkCreate(configs: Partial<Configuration>[]): Promise<Configuration[]> {
    const entities = configs.map((config) => this.repository.create(config));
    return this.repository.save(entities);
  }

  /**
   * Get all unique categories
   */
  async getCategories(): Promise<ConfigCategory[]> {
    const result = await this.repository.createQueryBuilder('config').select('DISTINCT config.category', 'category').getRawMany();

    return result.map((r) => r.category as ConfigCategory);
  }

  /**
   * Get configuration history (if needed for audit trail)
   */
  async getHistory(key: string, environment: ConfigEnvironment): Promise<Configuration[]> {
    return this.repository.find({
      where: { key, environment },
      order: { version: 'DESC', updatedAt: 'DESC' },
    });
  }

  /**
   * Count configurations by filters
   */
  async count(filters?: { category?: ConfigCategory; environment?: ConfigEnvironment; isActive?: boolean }): Promise<number> {
    const whereConditions: FindOptionsWhere<Configuration> = {};

    if (filters?.category) {
      whereConditions.category = filters.category;
    }

    if (filters?.environment) {
      whereConditions.environment = filters.environment;
    }

    if (filters?.isActive !== undefined) {
      whereConditions.isActive = filters.isActive;
    }

    return this.repository.count({ where: whereConditions });
  }
}
