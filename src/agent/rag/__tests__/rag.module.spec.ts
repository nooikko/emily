import { Test, TestingModule } from '@nestjs/testing';
import { RAGModule } from '../rag.module';
import { ConversationalRetrievalService } from '../services/conversational-retrieval.service';
import { QARetrievalService } from '../services/qa-retrieval.service';
import { EnsembleRetrieverService } from '../services/ensemble-retriever.service';
import { CompressionRetrieverService } from '../services/compression-retriever.service';
import { ParentDocumentRetrieverService } from '../services/parent-document-retriever.service';
import { SelfQueryRetrieverService } from '../services/self-query-retriever.service';
import { RerankingService } from '../services/reranking.service';

describe('RAGModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [RAGModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide ConversationalRetrievalService', () => {
    const service = module.get<ConversationalRetrievalService>(ConversationalRetrievalService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ConversationalRetrievalService);
  });

  it('should provide QARetrievalService', () => {
    const service = module.get<QARetrievalService>(QARetrievalService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(QARetrievalService);
  });

  it('should provide EnsembleRetrieverService', () => {
    const service = module.get<EnsembleRetrieverService>(EnsembleRetrieverService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(EnsembleRetrieverService);
  });

  it('should provide CompressionRetrieverService', () => {
    const service = module.get<CompressionRetrieverService>(CompressionRetrieverService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(CompressionRetrieverService);
  });

  it('should provide ParentDocumentRetrieverService', () => {
    const service = module.get<ParentDocumentRetrieverService>(ParentDocumentRetrieverService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ParentDocumentRetrieverService);
  });

  it('should provide SelfQueryRetrieverService', () => {
    const service = module.get<SelfQueryRetrieverService>(SelfQueryRetrieverService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(SelfQueryRetrieverService);
  });

  it('should provide RerankingService', () => {
    const service = module.get<RerankingService>(RerankingService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(RerankingService);
  });

  it('should export all RAG services', () => {
    // Test that all services can be retrieved, indicating they're properly exported
    const services = [
      ConversationalRetrievalService,
      QARetrievalService,
      EnsembleRetrieverService,
      CompressionRetrieverService,
      ParentDocumentRetrieverService,
      SelfQueryRetrieverService,
      RerankingService
    ];

    services.forEach(ServiceClass => {
      const service = module.get(ServiceClass);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ServiceClass);
    });
  });
});