import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Document } from '@langchain/core/documents';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { type DocumentFormat, type MetadataExtractionConfig } from '../interfaces/document-loader.interface';

const DocumentMetadataSchema = z.object({
  title: z.string().optional().describe('The title of the document'),
  author: z.string().optional().describe('The author of the document'),
  subject: z.string().optional().describe('The subject or topic of the document'),
  category: z.string().optional().describe('Document category or type'),
  keywords: z.array(z.string()).optional().describe('Key terms found in the document'),
  summary: z.string().optional().describe('Brief summary of the document content'),
  language: z.string().optional().describe('Language of the document'),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional().describe('Overall sentiment'),
  readabilityScore: z.number().optional().describe('Readability score (0-100)'),
  entities: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(['person', 'organization', 'location', 'date', 'other']),
      }),
    )
    .optional()
    .describe('Named entities found in the document'),
});

type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

interface ExtractedMetadata {
  fileProperties?: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    createdAt?: Date;
    modifiedAt?: Date;
    format?: DocumentFormat;
    encoding?: string;
    checksum?: string;
  };
  contentMetadata?: DocumentMetadata;
  structuralMetadata?: {
    pageCount?: number;
    paragraphCount?: number;
    sentenceCount?: number;
    wordCount?: number;
    characterCount?: number;
    averageWordsPerSentence?: number;
    hasImages?: boolean;
    hasTables?: boolean;
    hasCode?: boolean;
    codeLanguages?: string[];
  };
  customMetadata?: Record<string, any>;
}

@Injectable()
export class MetadataExtractionService {
  private readonly logger = new Logger(MetadataExtractionService.name);
  private readonly keywordExtractors = new Map<string, (text: string) => string[]>();
  private readonly documentClassifiers = new Map<string, (text: string) => string>();
  private contentParser?: any; // StructuredOutputParser typing issue with Zod
  private extractionChain?: RunnableSequence;

  constructor() {
    this.logger.log('MetadataExtractionService initialized');
    this.initializeExtractors();
    this.initializeExtractionChain();
  }

  private initializeExtractors(): void {
    this.keywordExtractors.set('tfidf', this.extractKeywordsTFIDF.bind(this));
    this.keywordExtractors.set('frequency', this.extractKeywordsFrequency.bind(this));
    this.keywordExtractors.set('ngram', this.extractKeywordsNGram.bind(this));

    this.documentClassifiers.set('simple', this.classifyDocumentSimple.bind(this));
    this.documentClassifiers.set('pattern', this.classifyDocumentPattern.bind(this));
  }

  private initializeExtractionChain(): void {
    try {
      this.contentParser = StructuredOutputParser.fromZodSchema(DocumentMetadataSchema);

      const promptTemplate = PromptTemplate.fromTemplate(`
        Analyze the following document content and extract metadata.
        
        {format_instructions}
        
        Document content:
        {content}
        
        Extracted metadata:
      `);

      this.extractionChain = RunnableSequence.from([
        {
          content: (input: { content: string }) => input.content.slice(0, 4000),
          format_instructions: () => this.contentParser!.getFormatInstructions(),
        },
        promptTemplate,
      ]);
    } catch (error) {
      this.logger.warn('LangChain extraction chain initialization failed, using fallback', error);
    }
  }

  async extractMetadata(document: Document, config: MetadataExtractionConfig = {}): Promise<ExtractedMetadata> {
    const metadata: ExtractedMetadata = {};
    const contentUpdates: Partial<DocumentMetadata> = {};

    try {
      const tasks: Promise<void>[] = [];

      if (config.extractFileProperties !== false) {
        tasks.push(
          this.extractFileProperties(document).then((props) => {
            metadata.fileProperties = props;
          }),
        );
      }

      if (config.extractContentMetadata !== false) {
        tasks.push(
          this.extractContentMetadata(document).then((content) => {
            metadata.contentMetadata = content;
          }),
        );
      }

      tasks.push(
        this.extractStructuralMetadata(document).then((structural) => {
          metadata.structuralMetadata = structural;
        }),
      );

      if (config.extractKeywords) {
        tasks.push(
          this.extractKeywords(document).then((keywords) => {
            contentUpdates.keywords = keywords;
          }),
        );
      }

      if (config.generateSummary) {
        tasks.push(
          this.generateSummary(document).then((summary) => {
            contentUpdates.summary = summary;
          }),
        );
      }

      if (config.classifyDocument) {
        tasks.push(
          this.classifyDocument(document).then((category) => {
            contentUpdates.category = category;
          }),
        );
      }

      if (config.customExtractors?.length) {
        for (const extractor of config.customExtractors) {
          tasks.push(
            this.runCustomExtractor(document, extractor).then((custom) => {
              if (!metadata.customMetadata) {
                metadata.customMetadata = {};
              }
              metadata.customMetadata[extractor.name] = custom;
            }),
          );
        }
      }

      await Promise.all(tasks);

      // Merge content updates
      if (Object.keys(contentUpdates).length > 0) {
        metadata.contentMetadata = {
          ...metadata.contentMetadata,
          ...contentUpdates,
        };
      }

      return metadata;
    } catch (error) {
      this.logger.error(`Metadata extraction failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async enrichDocument(document: Document, metadata: ExtractedMetadata): Promise<Document> {
    const enrichedMetadata = {
      ...document.metadata,
      ...this.flattenMetadata(metadata),
      enrichedAt: new Date().toISOString(),
    };

    return new Document({
      pageContent: document.pageContent,
      metadata: enrichedMetadata,
    });
  }

  private async extractFileProperties(document: Document): Promise<ExtractedMetadata['fileProperties']> {
    const properties: ExtractedMetadata['fileProperties'] = {};

    if (document.metadata?.source && typeof document.metadata.source === 'string') {
      try {
        const stats = await fs.stat(document.metadata.source).catch(() => null);
        if (stats) {
          properties.fileName = path.basename(document.metadata.source);
          properties.fileSize = stats.size;
          properties.createdAt = stats.birthtime;
          properties.modifiedAt = stats.mtime;
        }
      } catch (error) {
        this.logger.debug(`Could not extract file stats: ${error.message}`);
      }
    }

    properties.format = document.metadata?.format as DocumentFormat;
    properties.mimeType = document.metadata?.mimeType;
    properties.encoding = document.metadata?.encoding || 'utf-8';
    properties.checksum = this.generateChecksum(document.pageContent);

    return properties;
  }

  private async extractContentMetadata(document: Document): Promise<DocumentMetadata> {
    if (this.extractionChain && this.contentParser) {
      try {
        const result = await this.extractionChain.invoke({
          content: document.pageContent,
        });

        if (typeof result === 'string') {
          return this.contentParser.parse(result);
        }
      } catch (error) {
        this.logger.debug(`LangChain extraction failed, using fallback: ${error.message}`);
      }
    }

    return this.extractContentMetadataFallback(document);
  }

  private extractContentMetadataFallback(document: Document): DocumentMetadata {
    const content = document.pageContent;
    const metadata: DocumentMetadata = {};

    const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.{1,100})/);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    metadata.language = this.detectLanguage(content);
    metadata.sentiment = this.analyzeSentiment(content);
    metadata.readabilityScore = this.calculateReadability(content);

    const entities = this.extractEntities(content);
    if (entities.length > 0) {
      metadata.entities = entities;
    }

    return metadata;
  }

  private async extractStructuralMetadata(document: Document): Promise<ExtractedMetadata['structuralMetadata']> {
    const content = document.pageContent;

    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0);
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = content.split(/\s+/).filter((w) => w.length > 0);

    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    const codeLanguages = new Set<string>();

    for (const block of codeBlocks) {
      const langMatch = block.match(/```(\w+)/);
      if (langMatch) {
        codeLanguages.add(langMatch[1]);
      }
    }

    return {
      pageCount: document.metadata?.pageCount || 1,
      paragraphCount: paragraphs.length,
      sentenceCount: sentences.length,
      wordCount: words.length,
      characterCount: content.length,
      averageWordsPerSentence: sentences.length > 0 ? Math.round(words.length / sentences.length) : 0,
      hasImages: /!\[.*?\]\(.*?\)/.test(content) || Boolean(document.metadata?.hasImages),
      hasTables: /\|.*\|.*\|/.test(content) || Boolean(document.metadata?.hasTables),
      hasCode: codeBlocks.length > 0,
      codeLanguages: Array.from(codeLanguages),
    };
  }

  private async extractKeywords(document: Document): Promise<string[]> {
    const extractor = this.keywordExtractors.get('frequency') || this.extractKeywordsFrequency;
    return extractor(document.pageContent);
  }

  private extractKeywordsFrequency(text: string): string[] {
    const stopWords = new Set([
      'the',
      'is',
      'at',
      'which',
      'on',
      'a',
      'an',
      'as',
      'are',
      'was',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'what',
      'which',
      'who',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'both',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'but',
      'and',
      'or',
      'if',
      'then',
      'else',
      'for',
      'of',
      'with',
      'to',
      'from',
      'up',
      'down',
      'in',
      'out',
      'off',
      'over',
      'under',
      'again',
      'further',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));

    const frequency = new Map<string, number>();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private extractKeywordsTFIDF(text: string): string[] {
    return this.extractKeywordsFrequency(text);
  }

  private extractKeywordsNGram(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);

    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }

    const frequency = new Map<string, number>();
    for (const bigram of bigrams) {
      frequency.set(bigram, (frequency.get(bigram) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([bigram]) => bigram);
  }

  private async generateSummary(document: Document): Promise<string> {
    const content = document.pageContent;
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);

    if (sentences.length === 0) {
      return '';
    }
    if (sentences.length <= 3) {
      return sentences.join('. ').trim();
    }

    const firstSentence = sentences[0];
    const middleSentence = sentences[Math.floor(sentences.length / 2)];
    const lastSentence = sentences[sentences.length - 1];

    return `${firstSentence.trim()}. ${middleSentence.trim()}. ${lastSentence.trim()}.`.replace(/\s+/g, ' ').slice(0, 500);
  }

  private async classifyDocument(document: Document): Promise<string> {
    const classifier = this.documentClassifiers.get('pattern') || this.classifyDocumentPattern;
    return classifier(document.pageContent);
  }

  private classifyDocumentSimple(text: string): string {
    const content = text.toLowerCase();

    // Check for bug-report indicators first (more specific)
    if (/\berror:\s|\bexception\b|\bstack trace\b/.test(content)) {
      return 'bug-report';
    }
    if (/\bapi\b|\bendpoint|\brequest|\bresponse|\brest\b|\bgraphql\b/.test(content)) {
      return 'technical-api';
    }
    if (/\bfunction\b|\bclass\b|\bconst\b|\blet\b|\bvar\b|\breturn\b/.test(content)) {
      return 'code';
    }
    if (/\b\d{4}-\d{2}-\d{2}\b|\bmeeting\b|\bagenda\b|\bminutes\b/.test(content)) {
      return 'meeting-notes';
    }
    if (/\brequirement|\bspecification|\bfeature|\buser story\b/.test(content)) {
      return 'requirements';
    }
    if (/\bbug\b|\bissue\b/.test(content)) {
      return 'bug-report';
    }
    if (/\bguide\b|\btutorial\b|\bhow to\b|\bstep \d+\b|\binstructions\b/.test(content)) {
      return 'documentation';
    }

    return 'general';
  }

  private classifyDocumentPattern(text: string): string {
    const patterns = [
      { pattern: /```[\s\S]+```/g, category: 'code-documentation', weight: 3 },
      { pattern: /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/gi, category: 'sql', weight: 2 },
      { pattern: /\b(TODO|FIXME|HACK|NOTE):/g, category: 'development-notes', weight: 1 },
      { pattern: /\b\w+@\w+\.\w+\b/g, category: 'correspondence', weight: 1 },
      { pattern: /\$\d+|\d+\.\d{2}\s*(USD|EUR|GBP)/g, category: 'financial', weight: 2 },
      { pattern: /\b(patent|copyright|trademark|license)\b/gi, category: 'legal', weight: 2 },
    ];

    const scores = new Map<string, number>();

    for (const { pattern, category, weight } of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        scores.set(category, (scores.get(category) || 0) + matches.length * weight);
      }
    }

    if (scores.size === 0) {
      return this.classifyDocumentSimple(text);
    }

    return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  private detectLanguage(text: string): string {
    const languagePatterns = [
      { lang: 'en', patterns: [/\bthe\b/gi, /\band\b/gi, /\bof\b/gi, /\bto\b/gi] },
      { lang: 'es', patterns: [/\bel\b/gi, /\bla\b/gi, /\bde\b/gi, /\by\b/gi] },
      { lang: 'fr', patterns: [/\ble\b/gi, /\bla\b/gi, /\bde\b/gi, /\bet\b/gi] },
      { lang: 'de', patterns: [/\bder\b/gi, /\bdie\b/gi, /\bdas\b/gi, /\bund\b/gi] },
      { lang: 'zh', patterns: [/[\u4e00-\u9fa5]/g] },
      { lang: 'ja', patterns: [/[\u3040-\u309f\u30a0-\u30ff]/g] },
      { lang: 'ko', patterns: [/[\uac00-\ud7af]/g] },
    ];

    const scores = new Map<string, number>();

    for (const { lang, patterns } of languagePatterns) {
      let score = 0;
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          score += matches.length;
        }
      }
      if (score > 0) {
        scores.set(lang, score);
      }
    }

    if (scores.size === 0) {
      return 'en';
    }

    return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' | 'mixed' {
    const positiveWords = /\b(good|great|excellent|amazing|wonderful|fantastic|love|happy|success|achieve|improve|benefit)\b/gi;
    const negativeWords = /\b(bad|terrible|awful|hate|fail|error|problem|issue|bug|wrong|mistake|poor)\b/gi;

    const positiveMatches = text.match(positiveWords) || [];
    const negativeMatches = text.match(negativeWords) || [];

    const positiveScore = positiveMatches.length;
    const negativeScore = negativeMatches.length;

    if (positiveScore === 0 && negativeScore === 0) {
      return 'neutral';
    }
    if (positiveScore > negativeScore * 2) {
      return 'positive';
    }
    if (negativeScore > positiveScore * 2) {
      return 'negative';
    }
    if (positiveScore > 0 && negativeScore > 0) {
      return 'mixed';
    }

    return 'neutral';
  }

  private calculateReadability(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) {
      return 0;
    }

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const fleschScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return Math.max(0, Math.min(100, Math.round(fleschScore)));
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) {
      return 1;
    }

    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');

    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private extractEntities(text: string): Array<{ text: string; type: 'person' | 'organization' | 'location' | 'date' | 'other' }> {
    const entities: Array<{ text: string; type: 'person' | 'organization' | 'location' | 'date' | 'other' }> = [];

    const datePattern = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g;
    const dates = text.match(datePattern) || [];
    for (const date of dates) {
      entities.push({ text: date, type: 'date' });
    }

    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailPattern) || [];
    for (const email of emails) {
      const name = email.split('@')[0].replace(/[._-]/g, ' ');
      if (name.length > 2) {
        entities.push({ text: name, type: 'person' });
      }
    }

    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|Corp|LLC|Ltd)\.?)?/g) || [];
    for (const word of capitalizedWords) {
      const cleanWord = word.replace(/\.$/, ''); // Remove trailing period
      if (cleanWord.match(/\b(?:Inc|Corp|LLC|Ltd)\b/)) {
        entities.push({ text: cleanWord, type: 'organization' });
      } else if (word.split(' ').length === 2 && !['The', 'This', 'That', 'These', 'Those'].includes(word.split(' ')[0])) {
        entities.push({ text: word, type: 'person' });
      }
    }

    return entities.slice(0, 20);
  }

  private async runCustomExtractor(
    document: Document,
    extractor: { name: string; extractor: (document: Document) => Promise<Record<string, any>> },
  ): Promise<Record<string, any>> {
    try {
      return await extractor.extractor(document);
    } catch (error) {
      this.logger.error(`Custom extractor '${extractor.name}' failed: ${error.message}`);
      return { error: error.message };
    }
  }

  private generateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private flattenMetadata(metadata: ExtractedMetadata): Record<string, any> {
    const flat: Record<string, any> = {};

    if (metadata.fileProperties) {
      for (const [key, value] of Object.entries(metadata.fileProperties)) {
        flat[`file_${key}`] = value;
      }
    }

    if (metadata.contentMetadata) {
      for (const [key, value] of Object.entries(metadata.contentMetadata)) {
        if (key === 'entities' && Array.isArray(value)) {
          flat.entities = value.map((e) => e.text).join(', ');
          const uniqueTypes = new Set(value.map((e) => e.type));
          flat.entityTypes = Array.from(uniqueTypes).join(', ');
        } else {
          flat[key] = value;
        }
      }
    }

    if (metadata.structuralMetadata) {
      for (const [key, value] of Object.entries(metadata.structuralMetadata)) {
        flat[`structure_${key}`] = value;
      }
    }

    if (metadata.customMetadata) {
      for (const [key, value] of Object.entries(metadata.customMetadata)) {
        flat[`custom_${key}`] = value;
      }
    }

    return flat;
  }

  createEnrichmentChain(config: MetadataExtractionConfig): (document: Document) => Promise<Document> {
    return async (document: Document) => {
      const metadata = await this.extractMetadata(document, config);
      return this.enrichDocument(document, metadata);
    };
  }

  async batchExtractMetadata(documents: Document[], config: MetadataExtractionConfig = {}, concurrency = 5): Promise<Document[]> {
    const enrichmentChain = this.createEnrichmentChain(config);
    const results: Document[] = [];

    for (let i = 0; i < documents.length; i += concurrency) {
      const batch = documents.slice(i, i + concurrency);
      const enrichedBatch = await Promise.all(
        batch.map((doc) =>
          enrichmentChain(doc).catch((error) => {
            this.logger.error(`Failed to enrich document: ${error.message}`);
            return doc;
          }),
        ),
      );
      results.push(...enrichedBatch);
    }

    return results;
  }
}
