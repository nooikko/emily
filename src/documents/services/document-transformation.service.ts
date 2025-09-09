import { Document } from '@langchain/core/documents';
import { PromptTemplate } from '@langchain/core/prompts';
import { Runnable, RunnableConfig, RunnableLambda, RunnableParallel, RunnableSequence } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import { type DocumentTransformationConfig } from '../interfaces/document-loader.interface';

export interface TransformationChain {
  name: string;
  description: string;
  chain: Runnable;
  config?: RunnableConfig;
  type: 'preprocessing' | 'enrichment' | 'cleaning' | 'custom';
}

export interface TransformationResult {
  original: Document;
  transformed: Document;
  chainName: string;
  duration: number;
  metadata: {
    transformationId: string;
    timestamp: Date;
    success: boolean;
    error?: string;
    stats?: Record<string, any>;
  };
}

export interface PipelineConfiguration {
  chains: TransformationChain[];
  parallel?: boolean;
  stopOnError?: boolean;
  timeout?: number;
  retryCount?: number;
}

@Injectable()
export class DocumentTransformationService {
  private readonly logger = new Logger(DocumentTransformationService.name);
  private readonly transformationChains = new Map<string, TransformationChain>();

  constructor() {
    this.logger.log('DocumentTransformationService initialized');
    this.initializeDefaultChains();
  }

  private initializeDefaultChains(): void {
    // Text cleaning chain
    this.registerChain({
      name: 'text-cleaner',
      description: 'Cleans and normalizes document text',
      type: 'cleaning',
      chain: RunnableLambda.from((doc: Document) => this.cleanText(doc)),
    });

    // Whitespace normalization chain
    this.registerChain({
      name: 'whitespace-normalizer',
      description: 'Normalizes whitespace in documents',
      type: 'preprocessing',
      chain: RunnableLambda.from((doc: Document) => this.normalizeWhitespace(doc)),
    });

    // Unicode normalization chain
    this.registerChain({
      name: 'unicode-normalizer',
      description: 'Normalizes unicode characters',
      type: 'preprocessing',
      chain: RunnableLambda.from((doc: Document) => this.normalizeUnicode(doc)),
    });

    // Header/Footer removal chain
    this.registerChain({
      name: 'header-footer-remover',
      description: 'Removes headers and footers from documents',
      type: 'preprocessing',
      chain: RunnableLambda.from((doc: Document) => this.removeHeadersFooters(doc)),
    });

    // Language detection chain
    this.registerChain({
      name: 'language-detector',
      description: 'Detects and adds language metadata',
      type: 'enrichment',
      chain: RunnableLambda.from((doc: Document) => this.detectLanguage(doc)),
    });

    // Content structure analyzer
    this.registerChain({
      name: 'structure-analyzer',
      description: 'Analyzes document structure',
      type: 'enrichment',
      chain: RunnableLambda.from((doc: Document) => this.analyzeStructure(doc)),
    });
  }

  registerChain(chain: TransformationChain): void {
    this.transformationChains.set(chain.name, chain);
    this.logger.debug(`Registered transformation chain: ${chain.name}`);
  }

  async createPreprocessingChain(config?: DocumentTransformationConfig): Promise<Runnable> {
    const chains: Runnable[] = [];

    if (config?.cleaning) {
      if (config.cleaning.removeExtraWhitespace) {
        chains.push(this.transformationChains.get('whitespace-normalizer')!.chain);
      }
      if (config.cleaning.normalizeUnicode) {
        chains.push(this.transformationChains.get('unicode-normalizer')!.chain);
      }
      if (config.cleaning.removeSpecialCharacters || config.cleaning.toLowerCase) {
        chains.push(this.transformationChains.get('text-cleaner')!.chain);
      }
    }

    if (config?.preprocessing) {
      for (const preprocessor of config.preprocessing) {
        chains.push(RunnableLambda.from(preprocessor.transformer));
      }
    }

    if (chains.length === 0) {
      return RunnableLambda.from((doc: Document) => doc);
    }

    // Compose chains sequentially
    return chains.reduce(
      (prev, curr) => prev.pipe(curr),
      RunnableLambda.from((doc: Document) => doc),
    );
  }

  async createEnrichmentChain(config?: DocumentTransformationConfig): Promise<Runnable> {
    const enrichmentSteps: Runnable[] = [];

    if (config?.enrichment) {
      if (config.enrichment.addTimestamps) {
        enrichmentSteps.push(RunnableLambda.from((doc: Document) => this.addTimestamp(doc)));
      }
      if (config.enrichment.addDocumentId) {
        enrichmentSteps.push(RunnableLambda.from((doc: Document) => this.addDocumentId(doc)));
      }
      if (config.enrichment.addSourceInfo) {
        enrichmentSteps.push(RunnableLambda.from((doc: Document) => this.addSourceInfo(doc)));
      }

      if (config.enrichment.customEnrichers) {
        for (const enricher of config.enrichment.customEnrichers) {
          enrichmentSteps.push(RunnableLambda.from(enricher.enricher));
        }
      }
    }

    if (enrichmentSteps.length === 0) {
      return RunnableLambda.from((doc: Document) => doc);
    }

    // Compose enrichment steps sequentially
    return enrichmentSteps.reduce(
      (prev, curr) => prev.pipe(curr),
      RunnableLambda.from((doc: Document) => doc),
    );
  }

  async createSummarizationChain(maxLength = 500): Promise<Runnable> {
    const summarizationPrompt = PromptTemplate.fromTemplate(`
      Summarize the following document content in ${maxLength} characters or less.
      Focus on the main points and key information.
      
      Document content:
      {content}
      
      Summary:
    `);

    return RunnableSequence.from([
      {
        content: (doc: Document) => doc.pageContent.slice(0, 4000), // Limit input for LLM
      },
      summarizationPrompt,
      RunnableLambda.from((output: string) => output.trim()),
    ]);
  }

  async createEntityExtractionChain(): Promise<Runnable> {
    const entityPrompt = PromptTemplate.fromTemplate(`
      Extract named entities from the following document.
      Identify: people, organizations, locations, dates, and other important entities.
      
      Document content:
      {content}
      
      Format the output as JSON with the following structure:
      {{
        "people": ["name1", "name2"],
        "organizations": ["org1", "org2"],
        "locations": ["loc1", "loc2"],
        "dates": ["date1", "date2"],
        "other": ["entity1", "entity2"]
      }}
      
      Entities:
    `);

    return RunnableSequence.from([
      {
        content: (doc: Document) => doc.pageContent.slice(0, 3000),
      },
      entityPrompt,
      RunnableLambda.from((output: string) => {
        try {
          return JSON.parse(output);
        } catch {
          return { error: 'Failed to parse entities' };
        }
      }),
    ]);
  }

  async createCompositeChain(chains: string[]): Promise<Runnable> {
    const runnables: Runnable[] = [];

    for (const chainName of chains) {
      const chain = this.transformationChains.get(chainName);
      if (!chain) {
        this.logger.warn(`Chain ${chainName} not found, skipping`);
        continue;
      }
      runnables.push(chain.chain);
    }

    if (runnables.length === 0) {
      throw new Error('No valid chains provided for composite chain');
    }

    return RunnableSequence.from(runnables);
  }

  async transformDocument(document: Document, chainName: string, config?: RunnableConfig): Promise<TransformationResult> {
    const chain = this.transformationChains.get(chainName);
    if (!chain) {
      throw new Error(`Transformation chain '${chainName}' not found`);
    }

    const startTime = Date.now();
    const transformationId = this.generateTransformationId();

    try {
      const transformed = await chain.chain.invoke(document, config || chain.config);
      const duration = Date.now() - startTime;

      return {
        original: document,
        transformed: transformed as Document,
        chainName,
        duration,
        metadata: {
          transformationId,
          timestamp: new Date(),
          success: true,
          stats: this.calculateTransformationStats(document, transformed as Document),
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Transformation failed for chain ${chainName}: ${error.message}`);

      return {
        original: document,
        transformed: document, // Return original on error
        chainName,
        duration,
        metadata: {
          transformationId,
          timestamp: new Date(),
          success: false,
          error: error.message,
        },
      };
    }
  }

  async transformBatch(documents: Document[], chainName: string, config?: RunnableConfig): Promise<TransformationResult[]> {
    const chain = this.transformationChains.get(chainName);
    if (!chain) {
      throw new Error(`Transformation chain '${chainName}' not found`);
    }

    const results: TransformationResult[] = [];
    const batchSize = 10; // Process in batches for performance

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((doc) => this.transformDocument(doc, chainName, config)));
      results.push(...batchResults);
    }

    return results;
  }

  async executePipeline(document: Document, pipelineConfig: PipelineConfiguration): Promise<Document> {
    let currentDoc = document;
    const errors: string[] = [];

    if (pipelineConfig.parallel) {
      // Execute chains in parallel
      const parallelChains: Record<string, Runnable> = {};
      for (const chain of pipelineConfig.chains) {
        parallelChains[chain.name] = chain.chain;
      }

      try {
        const results = await RunnableParallel.from(parallelChains).invoke(currentDoc, {
          recursionLimit: 10,
          maxConcurrency: 5,
        });

        // Merge results from parallel execution
        currentDoc = this.mergeDocuments(document, results);
      } catch (error) {
        if (pipelineConfig.stopOnError) {
          throw error;
        }
        errors.push(error.message);
      }
    } else {
      // Execute chains sequentially
      for (const chain of pipelineConfig.chains) {
        try {
          const result = await this.executeWithRetry(
            () => chain.chain.invoke(currentDoc, chain.config),
            pipelineConfig.retryCount || 1,
            pipelineConfig.timeout,
          );
          currentDoc = result as Document;
        } catch (error) {
          this.logger.error(`Chain ${chain.name} failed: ${error.message}`);
          if (pipelineConfig.stopOnError) {
            throw error;
          }
          errors.push(`${chain.name}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      currentDoc.metadata = {
        ...currentDoc.metadata,
        pipelineErrors: errors,
      };
    }

    return currentDoc;
  }

  private async cleanText(document: Document): Promise<Document> {
    let content = document.pageContent;

    // Remove special characters (keep alphanumeric, spaces, and basic punctuation)
    content = content.replace(/[^\w\s.,!?;:\-'"]/g, '');

    // Remove multiple spaces
    content = content.replace(/\s+/g, ' ');

    // Trim
    content = content.trim();

    return new Document({
      pageContent: content,
      metadata: {
        ...document.metadata,
        cleaned: true,
        cleanedAt: new Date().toISOString(),
      },
    });
  }

  private async normalizeWhitespace(document: Document): Promise<Document> {
    let content = document.pageContent;

    // Replace tabs with spaces
    content = content.replace(/\t/g, ' ');

    // Replace multiple spaces with single space
    content = content.replace(/ +/g, ' ');

    // Replace multiple newlines with double newline
    content = content.replace(/\n{3,}/g, '\n\n');

    // Trim lines
    content = content
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    return new Document({
      pageContent: content,
      metadata: {
        ...document.metadata,
        whitespaceNormalized: true,
      },
    });
  }

  private async normalizeUnicode(document: Document): Promise<Document> {
    let content = document.pageContent;

    // Normalize to NFC (Canonical Decomposition, followed by Canonical Composition)
    content = content.normalize('NFC');

    // Replace common unicode quotes with standard quotes
    content = content.replace(/[""]/g, '"').replace(/['']/g, "'");

    // Replace unicode dashes with standard dash
    content = content.replace(/[–—]/g, '-');

    // Replace unicode ellipsis with three dots
    content = content.replace(/…/g, '...');

    return new Document({
      pageContent: content,
      metadata: {
        ...document.metadata,
        unicodeNormalized: true,
      },
    });
  }

  private async removeHeadersFooters(document: Document): Promise<Document> {
    const lines = document.pageContent.split('\n');
    const processedLines: string[] = [];

    // Simple heuristic: remove repeated lines that appear at regular intervals
    const lineFrequency = new Map<string, number>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        lineFrequency.set(trimmed, (lineFrequency.get(trimmed) || 0) + 1);
      }
    }

    // Lines that appear more than 3 times are likely headers/footers
    const frequentLines = new Set(
      Array.from(lineFrequency.entries())
        .filter(([, count]) => count > 3)
        .map(([line]) => line),
    );

    for (const line of lines) {
      const trimmed = line.trim();
      if (!frequentLines.has(trimmed)) {
        processedLines.push(line);
      }
    }

    return new Document({
      pageContent: processedLines.join('\n'),
      metadata: {
        ...document.metadata,
        headersFootersRemoved: true,
        removedLines: frequentLines.size,
      },
    });
  }

  private async detectLanguage(document: Document): Promise<Document> {
    // Simple language detection based on common words
    const content = document.pageContent.toLowerCase();
    const languages = [
      { code: 'en', words: ['the', 'and', 'of', 'to', 'in', 'is', 'that'], name: 'English' },
      { code: 'es', words: ['el', 'la', 'de', 'que', 'en', 'los', 'las'], name: 'Spanish' },
      { code: 'fr', words: ['le', 'de', 'la', 'et', 'les', 'des', 'que'], name: 'French' },
      { code: 'de', words: ['der', 'die', 'das', 'und', 'den', 'des', 'dem'], name: 'German' },
    ];

    const scores = new Map<string, number>();
    for (const lang of languages) {
      let score = 0;
      for (const word of lang.words) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = content.match(regex);
        if (matches) {
          score += matches.length;
        }
      }
      scores.set(lang.code, score);
    }

    const detectedLang = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
    const language = languages.find((l) => l.code === detectedLang[0]);

    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        language: language?.name || 'Unknown',
        languageCode: language?.code || 'unknown',
        languageConfidence: detectedLang[1] > 10 ? 'high' : 'low',
      },
    });
  }

  private async analyzeStructure(document: Document): Promise<Document> {
    const content = document.pageContent;

    const structure = {
      hasHeadings: /^#+\s/m.test(content) || /<h[1-6]>/i.test(content),
      hasList: /^[*\-+]\s/m.test(content) || /^\d+\.\s/m.test(content),
      hasCodeBlocks: /```[\s\S]*?```/.test(content) || /<code>/i.test(content),
      hasTables: /\|.*\|.*\|/.test(content) || /<table>/i.test(content),
      hasLinks: /\[.*?\]\(.*?\)/.test(content) || /<a\s+href=/i.test(content),
      hasImages: /!\[.*?\]\(.*?\)/.test(content) || /<img\s+src=/i.test(content),
      paragraphCount: content.split(/\n\n+/).filter((p) => p.trim().length > 0).length,
      estimatedReadingTime: Math.ceil(content.split(/\s+/).length / 200), // Assuming 200 words per minute
    };

    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        structure,
        structureAnalyzed: true,
      },
    });
  }

  private async addTimestamp(document: Document): Promise<Document> {
    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        processedAt: new Date().toISOString(),
        timestamp: Date.now(),
      },
    });
  }

  private async addDocumentId(document: Document): Promise<Document> {
    if (document.metadata?.documentId) {
      return document;
    }

    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        documentId: this.generateDocumentId(),
      },
    });
  }

  private async addSourceInfo(document: Document): Promise<Document> {
    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        sourceProcessor: 'DocumentTransformationService',
        sourceVersion: '1.0.0',
        processingNode: process.env.NODE_NAME || 'default',
      },
    });
  }

  private generateTransformationId(): string {
    return `transform_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private calculateTransformationStats(original: Document, transformed: Document): Record<string, any> {
    return {
      originalLength: original.pageContent.length,
      transformedLength: transformed.pageContent.length,
      lengthChange: transformed.pageContent.length - original.pageContent.length,
      compressionRatio: transformed.pageContent.length / original.pageContent.length,
      metadataKeysAdded: Object.keys(transformed.metadata || {}).length - Object.keys(original.metadata || {}).length,
    };
  }

  private mergeDocuments(original: Document, results: Record<string, any>): Document {
    let mergedContent = original.pageContent;
    const mergedMetadata = { ...original.metadata };

    for (const [key, value] of Object.entries(results)) {
      if (value instanceof Document) {
        // If result is a document, merge its metadata
        Object.assign(mergedMetadata, value.metadata);
        // Optionally update content if significantly different
        if (value.pageContent !== original.pageContent) {
          mergedContent = value.pageContent;
        }
      } else {
        // Add result as metadata
        mergedMetadata[key] = value;
      }
    }

    return new Document({
      pageContent: mergedContent,
      metadata: mergedMetadata,
    });
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, retries: number, timeout?: number): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < retries; i++) {
      try {
        if (timeout) {
          return await this.withTimeout(fn(), timeout);
        }
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.debug(`Retry ${i + 1}/${retries} failed: ${error.message}`);
        if (i < retries - 1) {
          await this.delay(2 ** i * 1000); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('All retries failed');
  }

  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)),
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
