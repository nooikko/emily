import type { BaseDocumentLoader } from '@langchain/core/document_loaders/base';
import { Document } from '@langchain/core/documents';
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { InMemoryStore } from '@langchain/core/stores';
import type { VectorStore } from '@langchain/core/vectorstores';
import { Injectable, Logger } from '@nestjs/common';
import { LangChainBaseService } from '../../../common/base/langchain-base.service';
import { LangSmithService } from '../../../langsmith/services/langsmith.service';
import { AIMetricsService } from '../../../observability/services/ai-metrics.service';
import { LangChainInstrumentationService } from '../../../observability/services/langchain-instrumentation.service';
import { CallbackManagerService } from '../../callbacks/callback-manager.service';
import type { DocumentChunkingConfig, HierarchicalDocument, ParentDocumentRetrieverConfig } from '../interfaces/rag.interface';

/**
 * Service for parent document retrieval with hierarchical document management.
 * Implements sophisticated document chunking strategies where child chunks
 * are used for search but parent documents are returned for context.
 *
 * Note: This is a simplified implementation as LangChain's ParentDocumentRetriever
 * and text splitter classes are not available in the current package versions.
 */
@Injectable()
export class ParentDocumentRetrieverService extends LangChainBaseService {
  private readonly documentStore = new InMemoryStore<Document>();

  constructor(
    callbackManagerService?: CallbackManagerService,
    langsmithService?: LangSmithService,
    metricsService?: AIMetricsService,
    instrumentationService?: LangChainInstrumentationService,
  ) {
    super('ParentDocumentRetrieverService', callbackManagerService, langsmithService, metricsService, instrumentationService);
  }

  /**
   * Create a parent document retriever with hierarchical search
   * Simplified implementation using available components
   */
  async createParentDocumentRetriever(config: ParentDocumentRetrieverConfig): Promise<RunnableSequence> {
    this.logExecution('createParentDocumentRetriever', {
      hasDocstore: !!config.docstore,
      hasChildSplitter: !!config.childSplitter,
      hasParentSplitter: !!config.parentSplitter,
      searchType: config.searchType,
      idKey: config.idKey,
    });

    // Store parent documents in the docstore if available
    // For simplified implementation, using internal memory store
    // In practice, would use config.docstore

    // Create a basic retrieval pipeline
    // Note: VectorStore cannot be used directly in RunnableSequence
    // In practice, would create a custom runnable that wraps the vector store
    return RunnableSequence.from([
      new RunnablePassthrough(), // Placeholder for vector store search
      new RunnablePassthrough(), // Placeholder for parent document lookup
    ]);
  }

  /**
   * Execute parent document retrieval with hierarchical context
   */
  async executeParentDocumentRetrieval(
    retriever: RunnableSequence,
    query: string,
    options?: {
      k?: number;
      includeParentContext?: boolean;
      includeChunkingMetrics?: boolean;
    },
  ): Promise<{
    documents: Document[];
    parentDocuments?: Document[];
    chunkingMetrics?: {
      totalChunks: number;
      parentDocuments: number;
      averageChunkSize: number;
      hierarchyLevels: number;
    };
  }> {
    const startTime = Date.now();
    const k = options?.k || 10;

    try {
      this.logExecution('executeParentDocumentRetrieval', {
        query: query.substring(0, 100),
        k,
        includeParentContext: options?.includeParentContext,
        includeChunkingMetrics: options?.includeChunkingMetrics,
      });

      // Execute retrieval
      const response = await retriever.invoke({ query });
      const childDocuments: Document[] = Array.isArray(response) ? response : [response];

      // Limit results
      const limitedDocuments = childDocuments.slice(0, k);

      // Get parent documents if requested
      let parentDocuments: Document[] | undefined;
      if (options?.includeParentContext) {
        parentDocuments = await this.getParentDocuments(limitedDocuments);
      }

      // Calculate chunking metrics if requested
      let chunkingMetrics: any | undefined;
      if (options?.includeChunkingMetrics) {
        chunkingMetrics = {
          totalChunks: limitedDocuments.length,
          parentDocuments: parentDocuments?.length || 0,
          averageChunkSize: limitedDocuments.reduce((sum, doc) => sum + doc.pageContent.length, 0) / limitedDocuments.length,
          hierarchyLevels: 2, // Simplified
        };
      }

      this.logger.debug('Parent document retrieval completed', {
        childDocuments: limitedDocuments.length,
        parentDocuments: parentDocuments?.length || 0,
        totalLatency: Date.now() - startTime,
      });

      return {
        documents: limitedDocuments,
        parentDocuments,
        chunkingMetrics,
      };
    } catch (error) {
      this.logger.error('Parent document retrieval failed:', error);
      throw new Error(`Parent document retrieval failed: ${error.message}`);
    }
  }

  /**
   * Create hierarchical documents from raw documents
   */
  async createHierarchicalDocuments(
    rawDocuments: Document[],
    chunkingConfig: DocumentChunkingConfig,
  ): Promise<{
    parentDocuments: HierarchicalDocument[];
    childDocuments: Document[];
  }> {
    this.logExecution('createHierarchicalDocuments', {
      documentCount: rawDocuments.length,
      parentChunkSize: chunkingConfig.parentChunkSize,
      childChunkSize: chunkingConfig.childChunkSize,
    });

    const parentDocuments: HierarchicalDocument[] = [];
    const childDocuments: Document[] = [];

    for (const doc of rawDocuments) {
      // Create parent document
      const parentDoc: HierarchicalDocument = {
        ...doc,
        parentId: undefined,
        childIds: [],
        level: 0,
        documentType: 'parent',
      };

      // Create child chunks using simple splitting
      const chunks = this.splitDocument(doc, chunkingConfig);
      const childIds: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const childId = `${doc.metadata.id || 'doc'}_chunk_${i}`;
        childIds.push(childId);

        const childDoc = new Document({
          pageContent: chunks[i],
          metadata: {
            ...doc.metadata,
            id: childId,
            parentId: doc.metadata.id || 'doc',
            chunkIndex: i,
            level: 1,
            documentType: 'child',
          },
        });

        childDocuments.push(childDoc);
      }

      parentDoc.childIds = childIds;
      parentDocuments.push(parentDoc);
    }

    this.logger.debug('Hierarchical documents created', {
      parentCount: parentDocuments.length,
      childCount: childDocuments.length,
      averageChildrenPerParent: childDocuments.length / parentDocuments.length,
    });

    return { parentDocuments, childDocuments };
  }

  /**
   * Analyze document chunking effectiveness
   */
  analyzeChunkingEffectiveness(docs: Document[]): {
    chunkingAnalysis: {
      averageChunkSize: number;
      chunkSizeVariance: number;
      totalChunks: number;
      chunkSizes: number[];
    };
    recommendations: string[];
  } {
    const chunkSizes = docs.map((d: Document) => d.pageContent.length);
    const averageChunkSize = chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length;
    const chunkSizeVariance = chunkSizes.reduce((sum, size) => sum + (size - averageChunkSize) ** 2, 0) / chunkSizes.length;

    const recommendations: string[] = [];
    if (chunkSizeVariance > averageChunkSize * 0.5) {
      recommendations.push('High chunk size variance detected - consider more consistent chunking strategy');
    }
    if (averageChunkSize > 2000) {
      recommendations.push('Large chunks detected - consider smaller chunk size for better retrieval');
    }
    if (averageChunkSize < 200) {
      recommendations.push('Small chunks detected - consider larger chunk size for better context');
    }

    const chunkingAnalysis = {
      averageChunkSize,
      chunkSizeVariance,
      totalChunks: docs.length,
      chunkSizes,
    };

    this.logger.debug('Chunking analysis completed', {
      averageChunkSize,
      chunkSizeVariance,
      totalChunks: docs.length,
    });

    return {
      chunkingAnalysis,
      recommendations,
    };
  }

  /**
   * Create adaptive chunking strategy
   */
  createAdaptiveChunkingStrategy(config: {
    minChunkSize: number;
    maxChunkSize: number;
    semanticBoundaries?: boolean;
    preserveStructure?: boolean;
  }): (text: string) => string[] {
    return (text: string) => {
      // Simple implementation - would be more sophisticated in practice
      const sentences = text.split('. ');
      const chunks: string[] = [];
      let currentChunk = '';

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > config.maxChunkSize && currentChunk.length > config.minChunkSize) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? '. ' : '') + sentence;
        }
      }

      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }

      return chunks;
    };
  }

  /**
   * Get parent documents for given child documents
   */
  private async getParentDocuments(childDocuments: Document[]): Promise<Document[]> {
    const parentIds = new Set(childDocuments.map((doc) => doc.metadata.parentId).filter(Boolean));

    const parentDocuments: Document[] = [];
    for (const parentId of parentIds) {
      const parentDoc = await this.documentStore.mget([parentId]);
      if (parentDoc[0]) {
        parentDocuments.push(parentDoc[0]);
      }
    }

    return parentDocuments;
  }

  /**
   * Simple document splitting implementation
   */
  private splitDocument(document: Document, config: DocumentChunkingConfig): string[] {
    const text = document.pageContent;
    const chunkSize = config.childChunkSize || 1000;
    const overlap = config.childChunkOverlap || 200;

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);
      chunks.push(chunk);

      if (end === text.length) break;
      start = end - overlap;
    }

    return chunks;
  }

  /**
   * Convert regular document to hierarchical document
   */
  private convertToHierarchicalDocument(doc: any): HierarchicalDocument {
    return {
      ...doc,
      level: 0,
      parentId: undefined,
      childIds: [],
      documentType: 'parent',
    };
  }
}
