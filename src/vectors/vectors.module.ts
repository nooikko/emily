import { Global, Module } from '@nestjs/common';
import { BgeEmbeddingsService } from './services/bge-embeddings.service';
import { QdrantService } from './services/qdrant.service';
import { VectorStoreService } from './services/vector-store.service';

@Global()
@Module({
  providers: [BgeEmbeddingsService, QdrantService, VectorStoreService],
  exports: [BgeEmbeddingsService, QdrantService, VectorStoreService],
})
export class VectorsModule {}
