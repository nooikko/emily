import type { StructuredToolInterface } from '@langchain/core/tools';
import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { ToolExecutionContext, ToolHandler, ToolMetadata, ToolValidationResult } from '../interfaces/tool-registry.interface';

/**
 * Builder class for creating StructuredTool instances with comprehensive validation
 */
export class StructuredToolBuilder<TInput extends z.ZodTypeAny = z.ZodAny> {
  private readonly logger = new Logger(StructuredToolBuilder.name);
  private name: string;
  private description: string;
  private schema: TInput;
  private handler?: (input: z.infer<TInput>, context?: ToolExecutionContext) => Promise<any>;
  private metadata?: Partial<ToolMetadata>;
  private validators: Array<(input: z.infer<TInput>) => boolean | Promise<boolean>> = [];
  private preprocessors: Array<(input: any) => any> = [];
  private postprocessors: Array<(result: any) => any> = [];
  private errorHandlers: Array<(error: Error, context?: ToolExecutionContext) => void> = [];

  constructor(name: string) {
    this.name = name;
    this.description = '';
    this.schema = z.any() as unknown as TInput;
  }

  /**
   * Set the tool description
   */
  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Set the input schema with validation
   */
  withSchema<T extends z.ZodTypeAny>(schema: T): StructuredToolBuilder<T> {
    const builder = this as any as StructuredToolBuilder<T>;
    builder.schema = schema;
    return builder;
  }

  /**
   * Set the tool handler function
   */
  withHandler(handler: (input: z.infer<TInput>, context?: ToolExecutionContext) => Promise<any>): this {
    this.handler = handler;
    return this;
  }

  /**
   * Add metadata to the tool
   */
  withMetadata(metadata: Partial<ToolMetadata>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  /**
   * Add a custom validator
   */
  addValidator(validator: (input: z.infer<TInput>) => boolean | Promise<boolean>): this {
    this.validators.push(validator);
    return this;
  }

  /**
   * Add input preprocessor
   */
  addPreprocessor(preprocessor: (input: any) => any): this {
    this.preprocessors.push(preprocessor);
    return this;
  }

  /**
   * Add output postprocessor
   */
  addPostprocessor(postprocessor: (result: any) => any): this {
    this.postprocessors.push(postprocessor);
    return this;
  }

  /**
   * Add error handler
   */
  addErrorHandler(handler: (error: Error, context?: ToolExecutionContext) => void): this {
    this.errorHandlers.push(handler);
    return this;
  }

  /**
   * Validate the builder configuration
   */
  validate(): ToolValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!this.name) {
      errors.push('Tool name is required');
    }

    if (!this.description) {
      errors.push('Tool description is required');
    }

    if (!this.handler) {
      errors.push('Tool handler function is required');
    }

    if (!this.schema) {
      warnings.push('No schema defined - using z.any()');
    }

    if (this.validators.length === 0) {
      suggestions.push('Consider adding custom validators for additional validation');
    }

    if (!this.metadata?.version) {
      warnings.push('No version specified - defaulting to 1.0.0');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Build the StructuredTool instance
   */
  build(): StructuredToolInterface {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Invalid tool configuration: ${validation.errors?.join(', ')}`);
    }

    // Create the handler with all processors and validators
    const wrappedHandler = async (input: any): Promise<string> => {
      const context: ToolExecutionContext = {
        executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        startTime: Date.now(),
      };

      try {
        // Apply preprocessors
        let processedInput = input;
        for (const preprocessor of this.preprocessors) {
          processedInput = await preprocessor(processedInput);
        }

        // Validate with schema
        const parsedInput = await this.schema.parseAsync(processedInput);

        // Run custom validators
        for (const validator of this.validators) {
          const isValid = await validator(parsedInput);
          if (!isValid) {
            throw new Error('Custom validation failed');
          }
        }

        // Execute handler
        if (!this.handler) {
          throw new Error('No handler defined');
        }

        let result = await this.handler(parsedInput, context);

        // Apply postprocessors
        for (const postprocessor of this.postprocessors) {
          result = await postprocessor(result);
        }

        context.endTime = Date.now();

        // Return result as string
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (error) {
        // Handle errors
        for (const errorHandler of this.errorHandlers) {
          await errorHandler(error as Error, context);
        }

        this.logger.error(`Tool ${this.name} execution failed:`, error);
        throw error;
      }
    };

    return new DynamicStructuredTool({
      name: this.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
      description: this.description,
      schema: this.schema,
      func: wrappedHandler,
    });
  }

  /**
   * Static factory method for creating a builder
   */
  static create(name: string): StructuredToolBuilder {
    return new StructuredToolBuilder(name);
  }
}

/**
 * Base class for creating custom StructuredTool implementations
 */
export abstract class BaseStructuredTool<TInput = any, TOutput = any> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract get name(): string;
  abstract get description(): string;
  abstract get schema(): z.ZodSchema<TInput>;

  protected metadata: Partial<ToolMetadata> = {};
  protected validators: Array<(input: TInput) => boolean | Promise<boolean>> = [];
  protected middlewares: Array<(input: TInput, next: () => Promise<TOutput>) => Promise<TOutput>> = [];

  /**
   * Main execution method to be implemented by subclasses
   */
  protected abstract execute(input: TInput, context?: ToolExecutionContext): Promise<TOutput>;

  /**
   * Validation hook - can be overridden
   */
  protected async validate(input: TInput): Promise<boolean> {
    for (const validator of this.validators) {
      const isValid = await validator(input);
      if (!isValid) {
        return false;
      }
    }
    return true;
  }

  /**
   * Pre-execution hook
   */
  protected async beforeExecute(input: TInput, context?: ToolExecutionContext): Promise<void> {
    // Can be overridden by subclasses
  }

  /**
   * Post-execution hook
   */
  protected async afterExecute(result: TOutput, context?: ToolExecutionContext): Promise<void> {
    // Can be overridden by subclasses
  }

  /**
   * Error handling hook
   */
  protected async onError(error: Error, context?: ToolExecutionContext): Promise<void> {
    this.logger.error(`Tool ${this.name} error:`, error);
  }

  /**
   * Convert to LangChain StructuredTool
   */
  toLangChainTool(): StructuredToolInterface {
    return new DynamicStructuredTool({
      name: this.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
      description: this.description,
      schema: this.schema,
      func: async (input: any) => {
        const context: ToolExecutionContext = {
          executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          startTime: Date.now(),
        };

        try {
          // Parse and validate input
          const parsedInput = await this.schema.parseAsync(input);

          // Run custom validation
          const isValid = await this.validate(parsedInput);
          if (!isValid) {
            throw new Error('Validation failed');
          }

          // Run before hook
          await this.beforeExecute(parsedInput, context);

          // Execute with middleware chain
          let result: TOutput;
          if (this.middlewares.length > 0) {
            const executeWithMiddleware = async (index: number): Promise<TOutput> => {
              if (index >= this.middlewares.length) {
                return this.execute(parsedInput, context);
              }
              return this.middlewares[index](parsedInput, () => executeWithMiddleware(index + 1));
            };
            result = await executeWithMiddleware(0);
          } else {
            result = await this.execute(parsedInput, context);
          }

          // Run after hook
          context.endTime = Date.now();
          await this.afterExecute(result, context);

          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
          await this.onError(error as Error, context);
          throw error;
        }
      },
    });
  }

  /**
   * Add a validator
   */
  addValidator(validator: (input: TInput) => boolean | Promise<boolean>): this {
    this.validators.push(validator);
    return this;
  }

  /**
   * Add middleware
   */
  addMiddleware(middleware: (input: TInput, next: () => Promise<TOutput>) => Promise<TOutput>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Set metadata
   */
  setMetadata(metadata: Partial<ToolMetadata>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  /**
   * Get metadata
   */
  getMetadata(): Partial<ToolMetadata> {
    return this.metadata;
  }
}

/**
 * Schema validation utilities
 */
export class SchemaValidationUtils {
  /**
   * Create a strict schema that doesn't allow extra properties
   */
  static strictObject<T extends z.ZodRawShape>(shape: T): z.ZodObject<T> {
    return z.object(shape).strict();
  }

  /**
   * Create a schema with default values
   */
  static withDefaults<T extends z.ZodTypeAny>(schema: T, defaults: Partial<z.infer<T>>): T {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape as Record<string, z.ZodType>;
      const newShape: Record<string, z.ZodType> = {};

      for (const key in shape) {
        if (Object.hasOwn(defaults, key)) {
          newShape[key] = shape[key].default((defaults as Record<string, unknown>)[key]);
        } else {
          newShape[key] = shape[key];
        }
      }

      return z.object(newShape) as unknown as T;
    }

    return schema;
  }

  /**
   * Create a schema that coerces types
   */
  static coercive = {
    string: () => z.string().transform((val) => String(val)),
    number: () =>
      z
        .number()
        .or(z.string())
        .transform((val) => Number(val)),
    boolean: () =>
      z
        .boolean()
        .or(z.string())
        .transform((val) => {
          if (typeof val === 'boolean') return val;
          return val === 'true' || val === '1' || val === 'yes';
        }),
    date: () =>
      z
        .date()
        .or(z.string())
        .transform((val) => {
          if (val instanceof Date) return val;
          return new Date(val);
        }),
  };

  /**
   * Create a schema with custom error messages
   */
  static withErrorMessages<T extends z.ZodTypeAny>(schema: T, messages: Record<string, string>): T {
    return schema.refine(() => true, messages) as T;
  }

  /**
   * Validate a value against a schema and return detailed errors
   */
  static async validateWithDetails<T>(
    schema: z.ZodSchema<T>,
    value: unknown,
  ): Promise<{ success: boolean; data?: T; errors?: Array<{ path: string; message: string }> }> {
    try {
      const data = await schema.parseAsync(value);
      return { success: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.issues.map((err: z.ZodIssue) => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        return { success: false, errors };
      }
      throw error;
    }
  }
}
