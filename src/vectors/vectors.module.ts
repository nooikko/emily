import { Global, Module } from '@nestjs/common';
import { LangSmithModule } from '../langsmith/langsmith.module';
import { BgeEmbeddingsService } from './services/bge-embeddings.service';
import { QdrantService } from './services/qdrant.service';
import { VectorStoreService } from './services/vector-store.service';

@Global()
@Module({
  imports: [LangSmithModule],
  providers: [BgeEmbeddingsService, QdrantService, VectorStoreService],
  exports: [BgeEmbeddingsService, QdrantService, VectorStoreService],
})
export class VectorsModule {}
