import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Pipeline, pipeline } from '@xenova/transformers';
import type { IEmbeddings } from '../interfaces/embeddings.interface';

// Type-safe pipeline interface for embeddings
interface EmbeddingsPipeline extends Pipeline {
  (
    text: string,
    options?: {
      pooling?: 'mean' | 'cls' | 'max';
      normalize?: boolean;
    },
  ): Promise<{
    data: Float32Array;
    dims: number[];
  }>;
}

@Injectable()
export class BgeEmbeddingsService implements IEmbeddings, OnModuleInit {
  protected readonly logger = new Logger(BgeEmbeddingsService.name);
  private embedder: EmbeddingsPipeline | null = null;
  private readonly dimensions = 768;
  private readonly modelName: string;
  private readonly queryInstruction = 'Represent this sentence for searching relevant passages: ';

  constructor(private readonly configService: ConfigService) {
    this.modelName = this.configService.get<string>('BGE_MODEL_NAME', 'BAAI/bge-base-en-v1.5');
  }

  async onModuleInit() {
    try {
      this.logger.log(`Initializing BGE embeddings model: ${this.modelName}`);

      // Try to initialize with explicit configuration to avoid ONNX quantized model issues
      this.embedder = (await pipeline('feature-extraction', this.modelName, {
        // Force use of non-quantized model to avoid the missing quantized ONNX file
        quantized: false,
        // Use local cache if available
        cache_dir: './models',
      })) as EmbeddingsPipeline;

      this.logger.log('BGE embeddings model initialized successfully');
    } catch (error: unknown) {
      this.logger.error('Failed to initialize BGE embeddings model', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error details:', {
        message: errorObj.message,
        modelName: this.modelName,
        stack: errorObj.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
      });

      // Don't throw the error - let the service continue without embeddings
      // This prevents the entire application from crashing
      this.logger.warn('BGE embeddings service will be disabled due to initialization failure');
      this.embedder = null;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error(`BGE embeddings model (${this.modelName}) is not available. The model failed to initialize during startup.`);
    }

    try {
      // Add query instruction for better retrieval performance
      const textWithInstruction = this.queryInstruction + text;

      // Generate embeddings
      const output = await this.embedder(textWithInstruction, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert to array and return
      return Array.from(output.data as Float32Array);
    } catch (error) {
      this.logger.error('Failed to embed query', error);
      throw error;
    }
  }

  async embedDocuments(documents: readonly string[]): Promise<number[][]> {
    if (!this.embedder) {
      throw new Error(`BGE embeddings model (${this.modelName}) is not available. The model failed to initialize during startup.`);
    }

    try {
      const embeddings: number[][] = [];

      // Process documents in batches to avoid memory issues
      for (const doc of documents) {
        const output = await this.embedder(doc, {
          pooling: 'mean',
          normalize: true,
        });

        embeddings.push(Array.from(output.data as Float32Array));
      }

      return embeddings;
    } catch (error) {
      this.logger.error('Failed to embed documents', error);
      throw error;
    }
  }

  getDimensions(): number {
    return this.dimensions;
  }
}
