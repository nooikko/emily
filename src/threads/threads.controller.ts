import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  BadRequestErrorDto,
  ForbiddenErrorDto,
  InternalServerErrorDto,
  NotFoundErrorDto,
  UnauthorizedErrorDto,
  ValidationErrorDto,
} from '../common/dto/error.dto';
import { TraceHTTP } from '../observability/decorators/trace.decorator';
import { StructuredLoggerService } from '../observability/services/structured-logger.service';
import { AutoCreateThreadDto, CreateThreadDto } from './dto/create-thread.dto';
import { ThreadQueryDto, ThreadSearchDto } from './dto/thread-query.dto';
import { ThreadListResponseDto, ThreadResponseDto, ThreadStatsResponseDto } from './dto/thread-response.dto';
import { BulkUpdateThreadsDto, UpdateThreadDto } from './dto/update-thread.dto';
import { ThreadsService } from './services/threads.service';

@ApiTags('threads')
@ApiBearerAuth()
@Controller('threads')
export class ThreadsController {
  constructor(
    private readonly threadsService: ThreadsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  )
  @ApiOperation({
    summary: 'Create a new conversation thread',
    description:
      'Creates a new conversation thread with specified title, category, and metadata. Used for organizing conversations into logical groups.',
  })
  @ApiBody({
    description: 'Thread creation data including title, category, and optional metadata',
    type: CreateThreadDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Thread created successfully',
    type: ThreadResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid thread data, validation failed, or category not found',
    type: ValidationErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required - invalid or missing Bearer token',
    type: UnauthorizedErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions for this operation',
    type: ForbiddenErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during thread creation',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'POST /threads' })
  async createThread(@Body() createThreadDto: CreateThreadDto): Promise<ThreadResponseDto> {
    this.logger.logInfo(`Creating thread: ${createThreadDto.title}`);

    try {
      const thread = await this.threadsService.createThread(createThreadDto);

      this.logger.logInfo(`Thread created successfully: ${thread.id}`);

      return thread;
    } catch (error) {
      this.logger.error('Failed to create thread', {
        title: createThreadDto.title,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Post('auto-create')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  )
  @ApiOperation({
    summary: 'Auto-create thread from message content',
    description:
      'Automatically creates a thread based on initial message content. Used for backward compatibility with existing threadId usage patterns.',
  })
  @ApiQuery({
    name: 'existingThreadId',
    description: 'Optional existing thread ID to check before creating new thread',
    required: false,
    type: 'string',
    format: 'uuid',
  })
  @ApiBody({
    description: 'Initial message content and metadata for auto-generating thread',
    type: AutoCreateThreadDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Thread auto-created successfully or existing thread returned',
    type: ThreadResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid message content or auto-creation parameters',
    type: ValidationErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required for thread creation',
    type: UnauthorizedErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during auto-creation',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'POST /threads/auto-create' })
  async autoCreateThread(
    @Body() autoCreateDto: AutoCreateThreadDto,
    @Query('existingThreadId') existingThreadId?: string,
  ): Promise<ThreadResponseDto> {
    this.logger.logInfo(`Auto-creating thread for: ${existingThreadId || 'new thread'}`);

    try {
      const thread = await this.threadsService.autoCreateThread(autoCreateDto, existingThreadId);

      this.logger.logInfo(`Thread auto-created successfully: ${thread.id}`);

      return thread;
    } catch (error) {
      this.logger.error('Failed to auto-create thread', {
        existingThreadId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Query conversation threads',
    description: 'Retrieves conversation threads with advanced filtering, searching, and pagination capabilities.',
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number for pagination',
    required: false,
    type: 'number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of threads per page',
    required: false,
    type: 'number',
    example: 20,
  })
  @ApiQuery({
    name: 'search',
    description: 'Search query for thread titles and content',
    required: false,
    type: 'string',
  })
  @ApiQuery({
    name: 'status',
    description: 'Filter by thread status',
    required: false,
    enum: ['active', 'archived', 'deleted', 'paused'],
  })
  @ApiQuery({
    name: 'priority',
    description: 'Filter by thread priority',
    required: false,
    enum: ['low', 'normal', 'high', 'urgent'],
  })
  @ApiQuery({
    name: 'categoryId',
    description: 'Filter by category ID',
    required: false,
    type: 'string',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'userId',
    description: 'Filter by user ID',
    required: false,
    type: 'string',
  })
  @ApiQuery({
    name: 'tags',
    description: 'Filter by tags (comma-separated)',
    required: false,
    type: 'string',
  })
  @ApiQuery({
    name: 'hasUnread',
    description: 'Filter threads with unread messages',
    required: false,
    type: 'boolean',
  })
  @ApiQuery({
    name: 'sortBy',
    description: 'Sort field',
    required: false,
    enum: ['createdAt', 'updatedAt', 'lastActivityAt', 'title', 'messageCount', 'priority'],
  })
  @ApiQuery({
    name: 'sortDirection',
    description: 'Sort direction',
    required: false,
    enum: ['asc', 'desc'],
  })
  @ApiResponse({
    status: 200,
    description: 'Threads retrieved successfully',
    type: ThreadListResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters or validation failed',
    type: BadRequestErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to access threads',
    type: UnauthorizedErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while querying threads',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'GET /threads' })
  async queryThreads(@Query() queryDto: ThreadQueryDto): Promise<ThreadListResponseDto> {
    this.logger.logInfo(`Querying threads - Page ${queryDto.page || 1}`);

    try {
      const result = await this.threadsService.queryThreads(queryDto);

      this.logger.logInfo(`Threads queried successfully - ${result.threads.length} results`);

      return result;
    } catch (error) {
      this.logger.error('Failed to query threads', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search conversation threads',
    description: 'Full-text search across thread titles, content, and tags with relevance scoring.',
  })
  @ApiQuery({
    name: 'query',
    description: 'Search query string',
    required: true,
    type: 'string',
    example: 'TypeScript best practices',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results to return',
    required: false,
    type: 'number',
    example: 50,
  })
  @ApiQuery({
    name: 'titleOnly',
    description: 'Search only in thread titles',
    required: false,
    type: 'boolean',
  })
  @ApiQuery({
    name: 'includeContent',
    description: 'Include message content in search',
    required: false,
    type: 'boolean',
  })
  @ApiQuery({
    name: 'includeTags',
    description: 'Include tags in search',
    required: false,
    type: 'boolean',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    type: [ThreadResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'Invalid search parameters',
    type: BadRequestErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required for search',
    type: UnauthorizedErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during search',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'GET /threads/search' })
  async searchThreads(@Query() searchDto: ThreadSearchDto): Promise<ThreadResponseDto[]> {
    this.logger.logInfo(`Searching threads: ${searchDto.query}`);

    try {
      const results = await this.threadsService.searchThreads(searchDto);

      this.logger.logInfo(`Thread search completed - ${results.length} results`);

      return results;
    } catch (error) {
      this.logger.error('Failed to search threads', {
        query: searchDto.query,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get thread statistics',
    description: 'Retrieves comprehensive statistics about threads including counts by status, priority, category, and popular tags.',
  })
  @ApiQuery({
    name: 'userId',
    description: 'Get statistics for specific user',
    required: false,
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Thread statistics retrieved successfully',
    type: ThreadStatsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to access statistics',
    type: UnauthorizedErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while calculating statistics',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'GET /threads/stats' })
  async getThreadStatistics(): Promise<ThreadStatsResponseDto> {
    this.logger.logInfo('Getting thread statistics');

    try {
      const stats = await this.threadsService.getThreadStatistics();

      this.logger.logInfo(`Thread statistics retrieved - ${stats.totalThreads} total threads`);

      return stats;
    } catch (error) {
      this.logger.error('Failed to get thread statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get conversation thread by ID',
    description: 'Retrieves a specific conversation thread with all its metadata and optional related data.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier for the thread',
    type: 'string',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Thread retrieved successfully',
    type: ThreadResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid thread ID format',
    type: BadRequestErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Thread not found',
    type: NotFoundErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to access thread',
    type: UnauthorizedErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Access denied - insufficient permissions for this thread',
    type: ForbiddenErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while retrieving thread',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'GET /threads/:id' })
  async getThreadById(@Param('id', ParseUUIDPipe) id: string): Promise<ThreadResponseDto> {
    this.logger.logInfo(`Getting thread by ID: ${id}`);

    try {
      const thread = await this.threadsService.findThreadById(id);

      if (!thread) {
        throw new NotFoundException(`Thread with ID ${id} not found`);
      }

      this.logger.logInfo(`Thread retrieved successfully: ${id}`);

      return thread;
    } catch (error) {
      this.logger.error('Failed to get thread', {
        threadId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  )
  @ApiOperation({
    summary: 'Update conversation thread',
    description: 'Updates an existing conversation thread with new metadata, status, or other properties.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier for the thread to update',
    type: 'string',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({
    description: 'Thread update data',
    type: UpdateThreadDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Thread updated successfully',
    type: ThreadResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid thread data or validation failed',
    type: ValidationErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Thread not found',
    type: NotFoundErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to update thread',
    type: UnauthorizedErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions to update this thread',
    type: ForbiddenErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while updating thread',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'PUT /threads/:id' })
  async updateThread(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateThreadDto): Promise<ThreadResponseDto> {
    this.logger.logInfo(`Updating thread: ${id}`);

    try {
      const thread = await this.threadsService.updateThread(id, updateDto);

      this.logger.logInfo(`Thread updated successfully: ${id}`);

      return thread;
    } catch (error) {
      this.logger.error('Failed to update thread', {
        threadId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete conversation thread',
    description: 'Deletes a conversation thread. By default performs soft delete (marks as deleted), but can perform hard delete if specified.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier for the thread to delete',
    type: 'string',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'hard',
    description: 'Perform hard delete (permanent removal)',
    required: false,
    type: 'boolean',
    example: false,
  })
  @ApiResponse({
    status: 204,
    description: 'Thread deleted successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid thread ID format',
    type: BadRequestErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Thread not found',
    type: NotFoundErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required to delete thread',
    type: UnauthorizedErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions to delete this thread',
    type: ForbiddenErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred while deleting thread',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'DELETE /threads/:id' })
  async deleteThread(@Param('id', ParseUUIDPipe) id: string, @Query('hard') hardDelete?: boolean): Promise<void> {
    this.logger.logInfo(`Deleting thread: ${id}${hardDelete ? ' (hard delete)' : ''}`);

    try {
      await this.threadsService.deleteThread(id, hardDelete);

      this.logger.logInfo(`Thread deleted successfully: ${id}`);
    } catch (error) {
      this.logger.error('Failed to delete thread', {
        threadId: id,
        hardDelete,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  )
  @ApiOperation({
    summary: 'Bulk update multiple threads',
    description:
      'Updates multiple threads at once with the same changes. Useful for batch operations like archiving or categorizing multiple threads.',
  })
  @ApiBody({
    description: 'Bulk update data including thread IDs and changes to apply',
    type: BulkUpdateThreadsDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Threads updated successfully',
    type: [ThreadResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'Invalid update data or one or more thread IDs not found',
    type: ValidationErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required for bulk operations',
    type: UnauthorizedErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions for bulk update',
    type: ForbiddenErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error occurred during bulk update',
    type: InternalServerErrorDto,
  })
  @TraceHTTP({ name: 'POST /threads/bulk-update' })
  async bulkUpdateThreads(@Body() bulkUpdateDto: BulkUpdateThreadsDto): Promise<ThreadResponseDto[]> {
    this.logger.logInfo(`Bulk updating ${bulkUpdateDto.threadIds.length} threads`);

    try {
      const threads = await this.threadsService.bulkUpdateThreads(bulkUpdateDto);

      this.logger.logInfo(`Bulk update completed successfully - ${threads.length} threads updated`);

      return threads;
    } catch (error) {
      this.logger.error('Failed to bulk update threads', {
        threadIds: bulkUpdateDto.threadIds,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
