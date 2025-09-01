# Research: BGE-base-en-v1.5 ONNX Integration & NestJS Vectors Module Refactoring
Date: 2025-09-01
Requested by: User

## Summary
Comprehensive research on integrating BGE-base-en-v1.5 ONNX model for embeddings in a NestJS application, including migration from OpenAI text-embedding-ada-002 (1536 dimensions) to BGE-base-en-v1.5 (768 dimensions), and restructuring Qdrant-specific code into a dedicated vectors module.

## Prior Research
References: AI_RESEARCH/2025-08-31-langchain-qdrant-checkpointing-integration.md
- Previous research established LangChain Qdrant integration patterns
- Current system uses OpenAI embeddings with 1536 dimensions
- Existing code structure in src/agent/memory/ needs refactoring

## Current Findings

### 1. BGE-base-en-v1.5 Model Specifications

#### Model Details
- **Embedding Dimension**: 768 (confirmed)
- **Sequence Length**: 512 tokens maximum
- **Parameters**: 109M
- **Model Type**: Feature Extraction / Sentence Embedding
- **Languages**: English only
- **License**: MIT (commercial use allowed)
- **Performance**: MTEB benchmark average score of 63.55

#### Key Usage Requirements
- **Query Instruction**: "Represent this sentence for searching relevant passages:"
- **ONNX Availability**: Yes, ONNX files are available on HuggingFace
- **Optimization**: Can be used with optimum.onnxruntime.ORTModelForFeatureExtraction

### 2. ONNX Runtime Node.js Integration

#### Required NPM Packages
```bash
# Primary ONNX Runtime package for Node.js
pnpm install onnxruntime-node

# Optional: For additional optimizations
pnpm install @xenova/transformers  # Transformers.js for easier integration
```

#### System Requirements
- **Node.js**: v16.x+ (recommended v20.x+)
- **Platform Support**: Cross-platform (Windows, macOS, Linux)
- **TypeScript**: Built-in type declarations included
- **Execution Providers**: CPU, WebGPU, DirectML, CUDA, CoreML

#### Basic ONNX Integration Pattern
```typescript
import * as ort from 'onnxruntime-node';

// Load ONNX model
const session = await ort.InferenceSession.create('path/to/bge-base-en-v1.5.onnx');

// Prepare input tensor
const inputs = {
  input_ids: new ort.Tensor('int64', inputIds, [1, inputIds.length]),
  attention_mask: new ort.Tensor('int64', attentionMask, [1, attentionMask.length])
};

// Run inference
const results = await session.run(inputs);
const embeddings = results.last_hidden_state.data; // Extract embedding vector
```

### 3. LangChain Embeddings Interface Implementation

#### Base Embeddings Class Structure
```typescript
import { Embeddings } from "@langchain/core/embeddings";

class BGEONNXEmbeddings extends Embeddings {
  private session: ort.InferenceSession | null = null;
  private modelPath: string;

  constructor(config: { modelPath: string }) {
    super(config);
    this.modelPath = config.modelPath;
  }

  async embedQuery(text: string): Promise<number[]> {
    // Implement single text embedding
    return await this.generateEmbedding(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    // Implement batch embedding generation
    return Promise.all(texts.map(text => this.generateEmbedding(text)));
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.session) {
      this.session = await ort.InferenceSession.create(this.modelPath);
    }
    
    // Tokenize input text (requires tokenizer implementation)
    // Run inference through ONNX model
    // Return 768-dimensional embedding vector
  }
}
```

#### Required Methods to Implement
- **embedQuery()**: Convert single text string to embedding vector (768 dimensions)
- **embedDocuments()**: Convert multiple text strings to embedding vectors
- **Initialization**: Load ONNX model and tokenizer
- **Tokenization**: Convert text to input_ids and attention_mask
- **Post-processing**: Extract and normalize embedding vectors

### 4. NestJS Vectors Module Structure

#### Recommended Directory Structure
```
src/
└── vectors/
    ├── vectors.module.ts
    ├── services/
    │   ├── bge-embeddings.service.ts
    │   ├── qdrant.service.ts
    │   └── vector-store.service.ts
    ├── interfaces/
    │   ├── embeddings.interface.ts
    │   └── vector-store.interface.ts
    └── dto/
        ├── embedding-query.dto.ts
        └── vector-search.dto.ts
```

#### Module Definition Pattern
```typescript
// vectors.module.ts
import { Module, Global } from '@nestjs/common';
import { BGEEmbeddingsService } from './services/bge-embeddings.service';
import { QdrantService } from './services/qdrant.service';
import { VectorStoreService } from './services/vector-store.service';

@Global()  // Make available across the application
@Module({
  providers: [
    BGEEmbeddingsService,
    QdrantService,
    VectorStoreService,
  ],
  exports: [
    BGEEmbeddingsService,
    QdrantService,
    VectorStoreService,
  ],
})
export class VectorsModule {}
```

#### Service Implementation Pattern
```typescript
// services/bge-embeddings.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BGEEmbeddingsService implements OnModuleInit {
  private embeddings: BGEONNXEmbeddings;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const modelPath = this.configService.get<string>('BGE_MODEL_PATH');
    this.embeddings = new BGEONNXEmbeddings({ modelPath });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(texts);
  }
}
```

#### Dependency Injection Best Practices
- Use `@Injectable()` decorator for all services
- Implement `OnModuleInit` for async initialization
- Export services from module for cross-module usage
- Use `@Global()` decorator for widely-used services
- Inject `ConfigService` for environment configuration

### 5. Migration Considerations & Strategy

#### Dimension Change Impact
- **Current**: OpenAI text-embedding-ada-002 (1536 dimensions)
- **Target**: BGE-base-en-v1.5 (768 dimensions)
- **Consequence**: Existing Qdrant collections MUST be recreated

#### Migration Approach
1. **Cannot Modify In-Place**: Qdrant collections with fixed vector dimensions cannot be changed
2. **Collection Recreation Required**: Must create new collection with 768 dimensions
3. **Data Migration**: Export existing data, re-embed with new model, import to new collection
4. **Alias Strategy**: Use Qdrant collection aliases for seamless switching

#### Recommended Migration Process
```typescript
// Step 1: Create new collection with 768 dimensions
await qdrantClient.createCollection('agent-memory-bge', {
  vectors: {
    size: 768,
    distance: 'Cosine'
  }
});

// Step 2: Migrate existing data
const existingData = await qdrantClient.scroll('agent-memory', { limit: 1000 });
for (const point of existingData.points) {
  // Re-embed text content using BGE model
  const newEmbedding = await bgeEmbeddings.embedQuery(point.payload.text);
  
  // Insert into new collection
  await qdrantClient.upsert('agent-memory-bge', {
    points: [{
      id: point.id,
      vector: newEmbedding,
      payload: point.payload
    }]
  });
}

// Step 3: Switch collection alias
await qdrantClient.createAlias('agent-memory', 'agent-memory-bge');
await qdrantClient.deleteCollection('agent-memory-old');
```

#### Configuration Updates Required
```typescript
// Environment variables to add
BGE_MODEL_PATH=/path/to/bge-base-en-v1.5.onnx
VECTOR_DIMENSION=768  // Update from 1536

// Update vector store initialization
const vectorStore = await QdrantVectorStore.fromExistingCollection(
  new BGEONNXEmbeddings({ modelPath: process.env.BGE_MODEL_PATH }), 
  {
    url: process.env.QDRANT_URL,
    collectionName: 'agent-memory-bge'
  }
);
```

### 6. Implementation Considerations

#### Performance Optimization
- **ONNX Runtime Configuration**: Use appropriate execution providers (CPU/GPU)
- **Batch Processing**: Process multiple texts simultaneously for better throughput
- **Model Caching**: Load ONNX model once and reuse across requests
- **Connection Pooling**: Reuse Qdrant client connections

#### Error Handling
- **Model Loading Failures**: Graceful fallback or startup failure
- **Tokenization Issues**: Handle text length limits (512 tokens max)
- **ONNX Runtime Errors**: Proper error propagation and logging
- **Migration Failures**: Rollback strategy for collection recreation

#### Testing Strategy
- **Unit Tests**: Mock ONNX runtime for service testing
- **Integration Tests**: Test with actual model files
- **Performance Tests**: Benchmark embedding generation speed
- **Migration Tests**: Validate dimension changes and data integrity

### 7. Code Refactoring Plan

#### From Current Structure (src/agent/memory/)
```
src/agent/memory/
├── qdrant.service.ts      # Move to src/vectors/services/
├── memory.service.ts      # Keep, but inject vector services
└── types.ts              # Split between modules
```

#### To New Structure (src/vectors/)
```
src/vectors/
├── vectors.module.ts
├── services/
│   ├── bge-embeddings.service.ts    # New
│   ├── qdrant.service.ts           # Moved from memory/
│   └── vector-store.service.ts     # New abstraction layer
└── interfaces/
    └── embeddings.interface.ts     # New
```

#### Memory Service Updates
```typescript
// src/agent/memory/memory.service.ts (Updated)
import { BGEEmbeddingsService } from '../../vectors/services/bge-embeddings.service';
import { VectorStoreService } from '../../vectors/services/vector-store.service';

@Injectable()
export class MemoryService {
  constructor(
    private embeddingsService: BGEEmbeddingsService,
    private vectorStoreService: VectorStoreService,
  ) {}

  async storeMemory(text: string, metadata: any): Promise<void> {
    const embedding = await this.embeddingsService.generateEmbedding(text);
    await this.vectorStoreService.addVector(embedding, { text, ...metadata });
  }

  async searchMemory(query: string, topK: number = 5): Promise<any[]> {
    const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
    return this.vectorStoreService.similaritySearch(queryEmbedding, topK);
  }
}
```

## Key Takeaways

- **BGE-base-en-v1.5 Specs**: 768 dimensions, 512 token limit, ONNX available, MIT licensed
- **ONNX Integration**: Use `onnxruntime-node` package with built-in TypeScript support
- **LangChain Compatibility**: Implement custom Embeddings class extending base interface
- **NestJS Structure**: Create dedicated vectors module with proper dependency injection
- **Migration Required**: Cannot change dimensions in-place, must recreate Qdrant collections
- **Performance**: ONNX provides good performance for local embedding generation
- **Refactoring**: Separate vector concerns from agent memory logic

## Implementation Recommendations

1. **Phase 1**: Create vectors module structure and BGE embeddings service
2. **Phase 2**: Implement ONNX runtime integration and testing
3. **Phase 3**: Create migration scripts for Qdrant collection recreation
4. **Phase 4**: Update memory service to use new vector services
5. **Phase 5**: Performance testing and optimization
6. **Phase 6**: Production deployment with proper monitoring

## Sources

### BGE Model Documentation
- HuggingFace Model Page: https://huggingface.co/BAAI/bge-base-en-v1.5
- BGE Model Paper: BAAI General Embedding specifications

### ONNX Runtime Documentation
- onnxruntime-node Package: https://www.npmjs.com/package/onnxruntime-node
- ONNX Runtime JavaScript API: https://onnxruntime.ai/docs/api/js/index.html
- ONNX Runtime Examples: https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js

### LangChain Documentation
- Embeddings Interface: https://js.langchain.com/docs/integrations/text_embedding/
- Custom Embeddings Implementation: LangChain Core Embeddings base class

### NestJS Documentation
- Module Structure: https://docs.nestjs.com/modules
- Dependency Injection: https://docs.nestjs.com/providers
- Best Practices: Various community resources on NestJS architecture

### Qdrant Documentation
- Collection Management: https://qdrant.tech/documentation/concepts/collections/
- Migration Strategies: https://qdrant.tech/documentation/database-tutorials/migration/
- Vector Configuration: https://qdrant.tech/documentation/concepts/vectors/

### Version Information
- Research conducted on: 2025-09-01
- BGE-base-en-v1.5: Current model version from HuggingFace
- ONNX Runtime: Latest stable Node.js package
- NestJS: Compatible with current framework patterns
- Qdrant: Current API version