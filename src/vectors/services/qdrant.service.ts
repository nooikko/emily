import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { IVectorStore } from '../interfaces/embeddings.interface';
import type { BgeEmbeddingsService } from './bge-embeddings.service';

export interface QdrantConfig {
  url: string;
  port: number;
  apiKey?: string;
  collectionPrefix: string;
}

@Injectable()
export class QdrantService implements IVectorStore, OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private qdrantClient: QdrantClient | null = null;
  private readonly config: QdrantConfig;

  constructor(private readonly embeddings: BgeEmbeddingsService) {
    this.config = this.loadConfig();
  }

  private loadConfig(): QdrantConfig {
    return {
      url: process.env.QDRANT_URL || 'http://localhost',
      port: process.env.QDRANT_PORT ? Number.parseInt(process.env.QDRANT_PORT, 10) : 6333,
      apiKey: process.env.QDRANT_API_KEY,
      collectionPrefix: process.env.QDRANT_COLLECTION_PREFIX || 'agent',
    };
  }

  async onModuleInit() {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.logger.log('Initializing Qdrant service...');

      // Initialize Qdrant client
      this.qdrantClient = new QdrantClient({
        url: this.config.url,
        port: this.config.port,
        apiKey: this.config.apiKey,
      });

      // Test connection
      await this.qdrantClient.getCollections();
      this.logger.log('Connected to Qdrant successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Qdrant service:', error);
      throw new Error(`Qdrant initialization failed: ${error.message}`);
    }
  }

  private async ensureCollection(collectionName: string): Promise<void> {
    if (!this.qdrantClient) {
      throw new Error('Qdrant client not initialized');
    }

    const fullCollectionName = `${this.config.collectionPrefix}_${collectionName}`;

    try {
      await this.qdrantClient.getCollection(fullCollectionName);
      this.logger.log(`Collection '${fullCollectionName}' already exists`);
    } catch (error) {
      if (error.status === 404) {
        this.logger.log(`Creating collection '${fullCollectionName}'...`);
        await this.qdrantClient.createCollection(fullCollectionName, {
          vectors: {
            size: this.embeddings.getDimensions(), // BGE dimensions (768)
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        this.logger.log(`Collection '${fullCollectionName}' created successfully`);
      } else {
        throw error;
      }
    }
  }

  async addDocuments(documents: Array<{ content: string; metadata?: Record<string, any> }>, collectionName: string): Promise<void> {
    if (!this.qdrantClient) {
      throw new Error('Qdrant client not initialized');
    }

    const fullCollectionName = `${this.config.collectionPrefix}_${collectionName}`;
    await this.ensureCollection(collectionName);

    try {
      // Generate embeddings for all documents
      const contents = documents.map((doc) => doc.content);
      const embeddings = await this.embeddings.embedDocuments(contents);

      // Prepare points for Qdrant
      const points = documents.map((doc, idx) => ({
        id: Date.now() + idx, // Simple ID generation
        vector: embeddings[idx],
        payload: {
          content: doc.content,
          ...doc.metadata,
        },
      }));

      // Upload to Qdrant
      await this.qdrantClient.upsert(fullCollectionName, {
        wait: true,
        points,
      });

      this.logger.debug(`Added ${documents.length} documents to collection ${fullCollectionName}`);
    } catch (error) {
      this.logger.error('Failed to add documents:', error);
      throw error;
    }
  }

  async similaritySearch(
    query: string,
    k: number,
    collectionName: string,
    filter?: Record<string, any>,
  ): Promise<Array<{ content: string; metadata?: Record<string, any>; score: number }>> {
    if (!this.qdrantClient) {
      throw new Error('Qdrant client not initialized');
    }

    const fullCollectionName = `${this.config.collectionPrefix}_${collectionName}`;

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Build filter if provided
      const qdrantFilter = filter ? this.buildQdrantFilter(filter) : undefined;

      // Search in Qdrant
      const searchResult = await this.qdrantClient.search(fullCollectionName, {
        vector: queryEmbedding,
        limit: k,
        filter: qdrantFilter,
        with_payload: true,
      });

      // Transform results
      return searchResult.map((result) => ({
        content: (result.payload?.content as string) || '',
        metadata: result.payload || {},
        score: result.score || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to perform similarity search:', error);
      throw error;
    }
  }

  private buildQdrantFilter(filter: Record<string, any>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      must.push({
        key,
        match: { value },
      });
    }

    return { must };
  }

  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.qdrantClient) {
      throw new Error('Qdrant client not initialized');
    }

    const fullCollectionName = `${this.config.collectionPrefix}_${collectionName}`;

    try {
      await this.qdrantClient.deleteCollection(fullCollectionName);
      this.logger.log(`Deleted collection ${fullCollectionName}`);
    } catch (error) {
      this.logger.error(`Failed to delete collection ${fullCollectionName}:`, error);
      throw error;
    }
  }

  async getCollectionInfo(collectionName: string): Promise<any> {
    if (!this.qdrantClient) {
      throw new Error('Qdrant client not initialized');
    }

    const fullCollectionName = `${this.config.collectionPrefix}_${collectionName}`;

    try {
      return await this.qdrantClient.getCollection(fullCollectionName);
    } catch (error) {
      this.logger.error(`Failed to get collection info for ${fullCollectionName}:`, error);
      throw error;
    }
  }

  async getHealthStatus(): Promise<{
    available: boolean;
    connected?: boolean;
    error?: string;
  }> {
    try {
      if (!this.qdrantClient) {
        return {
          available: false,
          connected: false,
          error: 'Qdrant client not initialized',
        };
      }

      await this.qdrantClient.getCollections();

      return {
        available: true,
        connected: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        available: false,
        connected: false,
        error: errorMessage,
      };
    }
  }

  async cleanup(): Promise<void> {
    this.logger.log('Cleaning up Qdrant service...');
    this.qdrantClient = null;
  }
}
