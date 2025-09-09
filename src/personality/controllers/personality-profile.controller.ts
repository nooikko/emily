import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConflictErrorDto, NotFoundErrorDto, ValidationErrorDto } from '../../common/dto/error.dto';
import { CreatePersonalityProfileDto, PersonalitySearchDto, SwitchPersonalityDto } from '../dto/create-personality-profile.dto';
import {
  BulkOperationResponseDto,
  DetailedPersonalityProfileResponseDto,
  PersonalityProfileResponseDto,
  PersonalityRecommendationResponseDto,
  PersonalitySwitchResponseDto,
  PersonalityUsageStatsResponseDto,
  PersonalityValidationResponseDto,
} from '../dto/personality-response.dto';
import { UpdatePersonalityProfileDto } from '../dto/update-personality-profile.dto';
import { PersonalityProfile } from '../entities/personality-profile.entity';
import { PersonalityProfileService } from '../services/personality-profile.service';
import { PersonalityTemplateService } from '../services/personality-template.service';

/**
 * Personality Profile Controller
 *
 * Provides REST API endpoints for managing AI personality profiles.
 * Supports full CRUD operations, personality switching, validation,
 * recommendations, and usage analytics.
 *
 * This controller enables users to:
 * - Create and manage multiple AI personalities
 * - Switch between personalities dynamically
 * - Get personality recommendations based on context
 * - View usage analytics and validation results
 * - Import/export personality configurations
 */
@ApiTags('personality')
@Controller('personality-profiles')
@ApiBearerAuth()
export class PersonalityProfileController {
  constructor(
    private readonly personalityProfileService: PersonalityProfileService,
    private readonly templateService: PersonalityTemplateService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new personality profile',
    description: `
      Creates a new AI personality profile with custom traits, prompt templates, and examples.
      
      **Features:**
      - Validates personality configuration using LangChain templates
      - Supports few-shot learning examples
      - Automatic template compilation and caching
      - Comprehensive trait-based personality definition
      
      **Use Cases:**
      - Create a coding assistant personality
      - Define a creative writing mentor
      - Build a professional consultant persona
      - Develop domain-specific AI characters
    `,
  })
  @ApiBody({
    type: CreatePersonalityProfileDto,
    description: 'Personality profile configuration',
    examples: {
      codingAssistant: {
        summary: 'Professional Coding Assistant',
        description: 'A helpful coding assistant with professional tone',
        value: {
          name: 'Professional Coding Assistant',
          description: 'A professional coding assistant that provides clear, well-documented solutions with expert-level technical knowledge.',
          traits: [
            {
              name: 'tone',
              value: 'professional',
              weight: 0.8,
              description: 'Maintains professional communication style',
            },
            {
              name: 'expertise_level',
              value: 'expert',
              weight: 0.9,
              description: 'Provides expert-level technical guidance',
            },
          ],
          promptTemplates: [
            {
              type: 'system',
              template:
                'You are a professional coding assistant with {expertise_level} knowledge. Maintain a {tone} tone and provide {communication_style} responses.',
              inputVariables: ['expertise_level', 'tone', 'communication_style'],
              priority: 1,
            },
          ],
          category: 'assistant',
          tags: ['coding', 'professional', 'technical'],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Personality profile created successfully',
    type: PersonalityProfileResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or invalid personality configuration',
    type: ValidationErrorDto,
  })
  @ApiConflictResponse({
    description: 'Personality profile with the same name already exists',
    type: ConflictErrorDto,
  })
  async create(@Body() createDto: CreatePersonalityProfileDto): Promise<PersonalityProfileResponseDto> {
    const personality = await this.personalityProfileService.create(createDto);
    return this.mapToResponseDto(personality);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all personality profiles',
    description: `
      Retrieves all personality profiles with optional filtering and search capabilities.
      
      **Search Features:**
      - Text search across names and descriptions
      - Category-based filtering
      - Tag-based filtering
      - System personality inclusion/exclusion
      - Active personality filtering
      
      **Performance:**
      - Efficient database queries
      - Optional pagination support
      - Cached template compilation
    `,
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Search query for name or description',
    example: 'coding assistant',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by personality category',
    enum: ['assistant', 'creative', 'analytical', 'educational', 'professional', 'casual', 'technical', 'research', 'support', 'custom'],
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Filter by tags (comma-separated)',
    example: 'coding,professional',
  })
  @ApiQuery({
    name: 'includeSystemPersonalities',
    required: false,
    type: Boolean,
    description: 'Include system personalities in results',
  })
  @ApiQuery({
    name: 'includeActiveOnly',
    required: false,
    type: Boolean,
    description: 'Include only active personalities',
  })
  @ApiResponse({
    status: 200,
    description: 'List of personality profiles retrieved successfully',
    type: [PersonalityProfileResponseDto],
  })
  async findAll(@Query() searchDto: PersonalitySearchDto): Promise<PersonalityProfileResponseDto[]> {
    const personalities = await this.personalityProfileService.findAll(searchDto);
    return personalities.map((personality) => this.mapToResponseDto(personality));
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get current active personality',
    description: `
      Retrieves the currently active personality profile with compiled templates.
      
      **Returns:**
      - Complete personality configuration
      - Compiled LangChain templates
      - Template metadata and compilation info
      - Returns null if no personality is active
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Current active personality retrieved successfully',
    type: DetailedPersonalityProfileResponseDto,
  })
  @ApiResponse({
    status: 204,
    description: 'No active personality found',
  })
  async getCurrentPersonality(): Promise<DetailedPersonalityProfileResponseDto | null> {
    const compiled = await this.personalityProfileService.getCurrentPersonality();

    if (!compiled) {
      return null;
    }

    // Get the personality entity for full details
    const personality = await this.personalityProfileService.findOne(compiled.metadata.personalityId);
    return this.mapToDetailedResponseDto(personality);
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Get personality recommendations',
    description: `
      Get AI-powered personality recommendations based on conversation context.
      
      **Features:**
      - Context-aware recommendations
      - Confidence scoring
      - Usage-based popularity factors
      - Trait matching analysis
      - Configurable result limits
      
      **Algorithm:**
      - Analyzes context keywords and patterns
      - Matches against personality traits and descriptions
      - Considers historical usage statistics
      - Calculates confidence scores
    `,
  })
  @ApiQuery({
    name: 'context',
    required: true,
    description: 'Context for personality recommendations',
    example: 'I need help with writing clean, maintainable code and following best practices',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of recommendations',
    example: 5,
  })
  @ApiResponse({
    status: 200,
    description: 'Personality recommendations generated successfully',
    type: [PersonalityRecommendationResponseDto],
  })
  async getRecommendations(@Query('context') context: string, @Query('limit') limit?: number): Promise<PersonalityRecommendationResponseDto[]> {
    if (!context) {
      throw new BadRequestException('Context is required for recommendations');
    }

    const recommendations = await this.personalityProfileService.recommendPersonalities(context, limit || 5);

    return recommendations.map((rec) => ({
      personalityId: rec.personalityId,
      personalityName: '', // Would need to fetch from service
      confidence: rec.confidence,
      reason: rec.reason,
      matchingTraits: rec.matchingTraits,
      usageFactors: rec.usageFactors,
    }));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get personality profile by ID',
    description: `
      Retrieves a specific personality profile with complete configuration details.
      
      **Includes:**
      - Full trait definitions
      - Complete prompt templates
      - Few-shot examples
      - Metadata and version info
      - Usage statistics
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Personality profile UUID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiResponse({
    status: 200,
    description: 'Personality profile retrieved successfully',
    type: DetailedPersonalityProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Personality profile not found',
    type: NotFoundErrorDto,
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<DetailedPersonalityProfileResponseDto> {
    const personality = await this.personalityProfileService.findOne(id);
    return this.mapToDetailedResponseDto(personality);
  }

  @Get(':id/validate')
  @ApiOperation({
    summary: 'Validate personality configuration',
    description: `
      Performs comprehensive validation of personality profile configuration.
      
      **Validation Checks:**
      - Template syntax and variable consistency
      - Trait completeness and value ranges
      - LangChain template compilation
      - Example format validation
      - Circular dependency detection
      
      **Returns detailed validation report with errors and warnings.**
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Personality profile UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation completed successfully',
    type: PersonalityValidationResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Personality profile not found',
    type: NotFoundErrorDto,
  })
  async validatePersonality(@Param('id', ParseUUIDPipe) id: string): Promise<PersonalityValidationResponseDto> {
    const validation = await this.personalityProfileService.validatePersonality(id);

    return {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      validatedAt: new Date(),
    };
  }

  @Get(':id/usage-stats')
  @ApiOperation({
    summary: 'Get personality usage statistics',
    description: `
      Retrieves usage analytics and performance metrics for a personality profile.
      
      **Metrics Include:**
      - Total usage count
      - Last usage timestamp
      - Average session duration
      - User satisfaction ratings
      - Common use cases
      - Performance trends
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Personality profile UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage statistics retrieved successfully',
    type: PersonalityUsageStatsResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Personality profile not found',
    type: NotFoundErrorDto,
  })
  async getUsageStats(@Param('id', ParseUUIDPipe) id: string): Promise<PersonalityUsageStatsResponseDto> {
    // Verify personality exists
    await this.personalityProfileService.findOne(id);

    const stats = await this.personalityProfileService.getUsageStats(id);
    return stats as PersonalityUsageStatsResponseDto;
  }

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Switch to a different personality',
    description: `
      Switches the active personality profile and compiles templates for immediate use.
      
      **Features:**
      - Immediate template compilation
      - Context-aware switching
      - Usage tracking
      - Previous personality deactivation
      - Template caching optimization
      
      **Use Cases:**
      - Switch from coding to creative writing mode
      - Adapt personality based on conversation context
      - Change expertise level dynamically
    `,
  })
  @ApiBody({
    type: SwitchPersonalityDto,
    description: 'Personality switching configuration',
  })
  @ApiResponse({
    status: 200,
    description: 'Personality switched successfully',
    type: PersonalitySwitchResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Target personality not found',
    type: NotFoundErrorDto,
  })
  async switchPersonality(@Body() switchDto: SwitchPersonalityDto): Promise<PersonalitySwitchResponseDto> {
    const currentPersonality = await this.personalityProfileService.getCurrentPersonality();

    const compiledTemplate = await this.personalityProfileService.switchPersonality(switchDto.personalityId, {
      previousPersonalityId: currentPersonality?.metadata.personalityId,
      conversationContext: switchDto.conversationContext,
      userPreferences: switchDto.userPreferences,
    });

    // Generate system prompt preview
    const preview = await this.templateService.formatTemplatePreview(compiledTemplate, switchDto.userPreferences || {});

    return {
      success: true,
      newPersonalityId: compiledTemplate.metadata.personalityId,
      newPersonalityName: compiledTemplate.metadata.personalityName,
      previousPersonalityId: currentPersonality?.metadata.personalityId,
      switchedAt: new Date(),
      systemPromptPreview: preview,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update personality profile',
    description: `
      Updates an existing personality profile with partial or complete changes.
      
      **Features:**
      - Partial updates supported
      - Version increment option
      - Template recompilation
      - Cache invalidation
      - Validation on update
      
      **Note:** System personalities cannot be modified.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Personality profile UUID',
  })
  @ApiBody({
    type: UpdatePersonalityProfileDto,
    description: 'Personality profile updates',
  })
  @ApiResponse({
    status: 200,
    description: 'Personality profile updated successfully',
    type: PersonalityProfileResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid update data or system personality modification attempt',
    type: ValidationErrorDto,
  })
  @ApiConflictResponse({
    description: 'Name conflict with existing personality',
    type: ConflictErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Personality profile not found',
    type: NotFoundErrorDto,
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdatePersonalityProfileDto): Promise<PersonalityProfileResponseDto> {
    const personality = await this.personalityProfileService.update(id, updateDto);
    return this.mapToResponseDto(personality);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete personality profile',
    description: `
      Permanently deletes a personality profile and clears associated templates.
      
      **Restrictions:**
      - System personalities cannot be deleted
      - Active personalities are deactivated before deletion
      - Template cache is cleared
      - Usage statistics are removed
      
      **Warning:** This action is irreversible.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Personality profile UUID',
  })
  @ApiResponse({
    status: 204,
    description: 'Personality profile deleted successfully',
  })
  @ApiBadRequestResponse({
    description: 'Cannot delete system personality',
    type: BadRequestException,
  })
  @ApiNotFoundResponse({
    description: 'Personality profile not found',
    type: NotFoundErrorDto,
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.personalityProfileService.remove(id);
  }

  @Post('bulk-import')
  @ApiOperation({
    summary: 'Bulk import personality profiles',
    description: `
      Imports multiple personality profiles in a single operation.
      
      **Features:**
      - Batch processing with error handling
      - Individual validation per profile
      - Partial success reporting
      - Detailed failure information
      - Transaction-like behavior per profile
    `,
  })
  @ApiBody({
    type: [CreatePersonalityProfileDto],
    description: 'Array of personality profiles to import',
  })
  @ApiResponse({
    status: 201,
    description: 'Bulk import completed',
    type: BulkOperationResponseDto,
  })
  async bulkImport(@Body() personalities: CreatePersonalityProfileDto[]): Promise<BulkOperationResponseDto> {
    const result = await this.personalityProfileService.bulkImport(personalities);

    return {
      successCount: result.success.length,
      failureCount: result.failures.length,
      failures: result.failures.map((f) => ({ item: f.dto.name, error: f.error })),
      processedAt: new Date(),
    };
  }

  @Get('export/all')
  @ApiOperation({
    summary: 'Export all personality profiles',
    description: `
      Exports all personality profiles for backup or migration purposes.
      
      **Options:**
      - Include/exclude system personalities
      - JSON format output
      - Complete configuration export
      - Template and example preservation
    `,
  })
  @ApiQuery({
    name: 'includeSystemPersonalities',
    required: false,
    type: Boolean,
    description: 'Include system personalities in export',
  })
  @ApiResponse({
    status: 200,
    description: 'Personalities exported successfully',
    type: [DetailedPersonalityProfileResponseDto],
  })
  async exportAll(@Query('includeSystemPersonalities') includeSystem?: boolean): Promise<DetailedPersonalityProfileResponseDto[]> {
    const personalities = await this.personalityProfileService.exportPersonalities(includeSystem);
    return personalities.map((p) => this.mapToDetailedResponseDto(p));
  }

  // Private helper methods

  private mapToResponseDto(personality: PersonalityProfile): PersonalityProfileResponseDto {
    return {
      id: personality.id,
      name: personality.name,
      description: personality.description,
      traits: personality.traits,
      promptTemplatesCount: personality.promptTemplates.length,
      examplesCount: personality.examples.length,
      category: personality.category,
      tags: personality.tags,
      isActive: personality.isActive,
      isSystemPersonality: personality.isSystemPersonality,
      metadata: personality.metadata,
      version: personality.version,
      createdAt: personality.createdAt,
      updatedAt: personality.updatedAt,
    };
  }

  private mapToDetailedResponseDto(personality: PersonalityProfile): DetailedPersonalityProfileResponseDto {
    return {
      ...this.mapToResponseDto(personality),
      promptTemplates: personality.promptTemplates,
      examples: personality.examples,
    };
  }
}
