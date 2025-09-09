# Research: LangChain TypeScript Document Metadata Extraction Best Practices
Date: 2025-09-09
Requested by: Research Specialist

## Summary
Comprehensive research on implementing document metadata extraction in TypeScript/NestJS with LangChain, covering StructuredOutputParser, Zod schema integration, document processing chains, and extraction patterns.

## Prior Research
No existing AI_RESEARCH files found for this specific topic.

## Current Findings

### 1. StructuredOutputParser and Zod Schema Integration

#### Recommended Approach (2024-2025)
**Primary Method: `withStructuredOutput()`** - This is now the preferred approach over traditional StructuredOutputParser:

```typescript
import { z } from "zod";

const extractionSchema = z.object({
  title: z.string().describe("Document title or main heading"),
  entities: z.array(z.string()).describe("Named entities found in the document"),
  keywords: z.array(z.string()).describe("Key terms and concepts"),
  classification: z.string().describe("Document category or type"),
  metadata: z.object({
    author: z.string().optional().describe("Document author if available"),
    date: z.string().optional().describe("Publication or creation date"),
    source: z.string().optional().describe("Source URL or file path")
  })
});

const structuredLlm = model.withStructuredOutput(extractionSchema);
const result = await structuredLlm.invoke("Extract metadata from this document...");
```

#### Alternative: StructuredOutputParser (For Complex Scenarios)
```typescript
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    title: z.string().describe("Document title"),
    entities: z.array(z.string()).describe("Named entities"),
    keywords: z.array(z.string()).describe("Important keywords"),
    classification: z.string().describe("Document category")
  })
);

const chain = prompt.pipe(model).pipe(parser);
```

#### TypeScript Typing Best Practices
- Use `.nullish()` for optional fields that may not exist in documents
- Add detailed `.describe()` annotations for better LLM understanding
- Define nested schemas for complex metadata structures
- Support arrays for multi-entity extraction

### 2. Document Processing Pipelines

#### Document Loader Integration
```typescript
import { DirectoryLoader } from "@langchain/community/document_loaders/fs/directory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "@langchain/community/document_loaders/fs/text";

const loader = new DirectoryLoader(
  "path/to/documents",
  {
    ".pdf": (path) => new PDFLoader(path),
    ".txt": (path) => new TextLoader(path),
    ".md": (path) => new TextLoader(path)
  }
);

const docs = await loader.load();
```

#### Metadata Enrichment Chain Pattern
```typescript
const enrichmentChain = RunnableSequence.from([
  // 1. Load document
  documentLoader,
  // 2. Extract structured metadata
  metadataExtractor.withStructuredOutput(metadataSchema),
  // 3. Enrich with additional processing
  entityExtractor,
  // 4. Store enhanced document
  documentStorer
]);
```

### 3. Entity and Keyword Extraction Patterns

#### Entity Extraction Schema
```typescript
const entitySchema = z.object({
  persons: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    context: z.string().optional()
  })).describe("People mentioned in the document"),
  organizations: z.array(z.string()).describe("Companies, institutions, or groups"),
  locations: z.array(z.string()).describe("Geographic locations or places"),
  dates: z.array(z.string()).describe("Important dates or time periods"),
  technologies: z.array(z.string()).describe("Technical terms, tools, or systems")
});
```

#### Keyword Extraction with Confidence Scoring
```typescript
const keywordSchema = z.object({
  primary_keywords: z.array(z.object({
    term: z.string(),
    relevance_score: z.number().min(0).max(1),
    context: z.string().optional()
  })).describe("Most important keywords with relevance scores"),
  secondary_keywords: z.array(z.string()).describe("Supporting keywords and phrases"),
  topics: z.array(z.string()).describe("Main topics or themes covered")
});
```

### 4. Document Classification Best Practices

#### Multi-level Classification Schema
```typescript
const classificationSchema = z.object({
  primary_category: z.enum([
    "technical_documentation",
    "business_report", 
    "research_paper",
    "legal_document",
    "marketing_material"
  ]).describe("Main document category"),
  
  secondary_category: z.string().optional().describe("More specific subcategory"),
  
  content_type: z.enum([
    "instruction_manual",
    "analysis_report",
    "specification",
    "tutorial",
    "policy_document"
  ]).describe("Content type classification"),
  
  confidence_score: z.number().min(0).max(1).describe("Classification confidence"),
  
  tags: z.array(z.string()).describe("Additional descriptive tags")
});
```

### 5. NestJS Integration Architecture

#### Service Layer Pattern
```typescript
@Injectable()
export class DocumentMetadataExtractionService {
  constructor(
    private readonly langchainService: LangchainService,
    private readonly documentProcessor: DocumentProcessorService
  ) {}

  async extractMetadata(document: Document): Promise<DocumentMetadata> {
    const extractionSchema = this.buildExtractionSchema();
    const structuredLlm = this.langchainService.getModel()
      .withStructuredOutput(extractionSchema);
    
    return await structuredLlm.invoke(document.content);
  }

  private buildExtractionSchema() {
    return z.object({
      // Schema definition based on document type
    });
  }
}
```

#### Module Organization
```typescript
@Module({
  imports: [
    ConfigModule,
    // LangChain modules
  ],
  providers: [
    DocumentMetadataExtractionService,
    EntityExtractionService,
    KeywordExtractionService,
    DocumentClassificationService
  ],
  controllers: [DocumentProcessingController],
  exports: [DocumentMetadataExtractionService]
})
export class DocumentProcessingModule {}
```

### 6. Advanced Processing Chains

#### Multi-stage Extraction Pipeline
```typescript
const extractionPipeline = RunnableSequence.from([
  // Stage 1: Basic metadata extraction
  {
    basic_metadata: basicMetadataExtractor.withStructuredOutput(basicSchema),
    content: RunnablePassthrough.assign({})
  },
  
  // Stage 2: Entity extraction
  {
    entities: entityExtractor.withStructuredOutput(entitySchema),
    previous: RunnablePassthrough.assign({})
  },
  
  // Stage 3: Classification and enrichment
  {
    classification: classificationExtractor.withStructuredOutput(classificationSchema),
    final_metadata: RunnablePassthrough.assign({})
  }
]);
```

#### Error Handling and Validation
```typescript
const validatedExtraction = extractionPipeline.pipe(
  RunnableLambda.from(async (result) => {
    try {
      // Validate extracted data
      const validated = metadataSchema.parse(result);
      return { success: true, data: validated };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        fallback: await this.extractBasicMetadata(result)
      };
    }
  })
);
```

## Key Takeaways

- **Use `withStructuredOutput()` over StructuredOutputParser** for most use cases (2024-2025 recommendation)
- **Zod schemas should include detailed descriptions** for better LLM understanding
- **Multi-stage extraction pipelines** work better than single-pass extraction for complex documents
- **TypeScript typing is crucial** for maintaining type safety throughout the extraction process
- **NestJS dependency injection** patterns work well with LangChain service architecture
- **Error handling and validation** are essential for production document processing
- **Modular service design** allows for flexible extraction strategies per document type

## Sources

- LangChain Official Documentation: https://js.langchain.com/docs/how_to/structured_output
- LangChain Extraction Tutorial: https://js.langchain.com/docs/tutorials/extraction
- LangChain Output Parsers: https://js.langchain.com/docs/concepts/output_parsers
- LangChain Document Loaders: https://js.langchain.com/docs/concepts/document_loaders
- Community Examples: https://www.js-craft.io/blog/structuredoutputparser-zod-langchain-javascript/
- Stack Overflow Discussions: Various TypeScript LangChain integration threads
- Medium Articles: NestJS LangChain integration patterns (2024)
- GitHub Discussions: LangChain-AI repository discussions on TypeScript patterns

**Version Information**: Research based on LangChain.js 2024-2025 documentation and community resources. Focus on TypeScript implementations with NestJS framework integration patterns.