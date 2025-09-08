import { Module } from '@nestjs/common';
import { VectorsModule } from '../../vectors/vectors.module';
import { MemoryModule } from '../memory/memory.module';
import { CallbackManagerService } from '../callbacks/callback-manager.service';
import { LangSmithModule } from '../../langsmith/langsmith.module';
import { ObservabilityModule } from '../../observability/observability.module';

// RAG Services
import { ConversationalRetrievalService } from './services/conversational-retrieval.service';
import { QARetrievalService } from './services/qa-retrieval.service';
import { EnsembleRetrieverService } from './services/ensemble-retriever.service';
import { CompressionRetrieverService } from './services/compression-retriever.service';
import { ParentDocumentRetrieverService } from './services/parent-document-retriever.service';
import { SelfQueryRetrieverService } from './services/self-query-retriever.service';
import { RerankingService } from './services/reranking.service';

/**
 * RAG (Retrieval-Augmented Generation) Module
 * 
 * This module provides comprehensive RAG capabilities including:
 * - Conversational retrieval chains with memory
 * - QA retrieval with source citations
 * - Ensemble retrieval for hybrid search
 * - Contextual compression for relevance filtering
 * - Parent-document retrieval for hierarchical documents
 * - Self-query retrieval for natural language queries
 * - Advanced reranking with MMR and LLM-based ranking
 */
@Module({
  imports: [
    VectorsModule,
    MemoryModule,
    LangSmithModule,
    ObservabilityModule,
  ],
  providers: [
    CallbackManagerService,
    ConversationalRetrievalService,
    QARetrievalService,
    EnsembleRetrieverService,
    CompressionRetrieverService,
    ParentDocumentRetrieverService,
    SelfQueryRetrieverService,
    RerankingService,
  ],
  exports: [
    ConversationalRetrievalService,
    QARetrievalService,
    EnsembleRetrieverService,
    CompressionRetrieverService,
    ParentDocumentRetrieverService,
    SelfQueryRetrieverService,
    RerankingService,
  ],
})
export class RAGModule {}