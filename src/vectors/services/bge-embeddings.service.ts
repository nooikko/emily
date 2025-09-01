import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { pipeline } from '@xenova/transformers';
import type { IEmbeddings } from '../interfaces/embeddings.interface';

@Injectable()
export class BgeEmbeddingsService implements IEmbeddings, OnModuleInit {
  private readonly logger = new Logger(BgeEmbeddingsService.name);
  private embedder: any; // Use any type to avoid type issues with Pipeline
  private readonly dimensions = 768;
  private readonly modelName = 'BAAI/bge-base-en-v1.5';
  private readonly queryInstruction = 'Represent this sentence for searching relevant passages: ';

  async onModuleInit() {
    try {
      this.logger.log(`Initializing BGE embeddings model: ${this.modelName}`);
      this.embedder = await pipeline('feature-extraction', this.modelName);
      this.logger.log('BGE embeddings model initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize BGE embeddings model', error);
      throw error;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embeddings model not initialized');
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

  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (!this.embedder) {
      throw new Error('Embeddings model not initialized');
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
