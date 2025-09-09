import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { VectorsModule } from '../vectors/vectors.module';
import { DocumentFormat } from './interfaces/document-loader.interface';
import { CSVLoaderService } from './loaders/csv-loader.service';
import { PDFLoaderService } from './loaders/pdf-loader.service';
import { TextLoaderService } from './loaders/text-loader.service';
import { UnstructuredLoaderService } from './loaders/unstructured-loader.service';
import { DocumentChunkingService } from './services/document-chunking.service';
import { DocumentLoaderService } from './services/document-loader.service';
import { DocumentPipelineService } from './services/document-pipeline.service';
import { DocumentTransformationService } from './services/document-transformation.service';
import { DocumentVectorIntegrationService } from './services/document-vector-integration.service';
import { DocumentVersioningService } from './services/document-versioning.service';
import { MetadataExtractionService } from './services/metadata-extraction.service';

@Module({
  imports: [EventEmitterModule.forRoot(), VectorsModule],
  providers: [
    DocumentLoaderService,
    DocumentChunkingService,
    MetadataExtractionService,
    DocumentVersioningService,
    DocumentTransformationService,
    DocumentPipelineService,
    DocumentVectorIntegrationService,
    PDFLoaderService,
    CSVLoaderService,
    TextLoaderService,
    UnstructuredLoaderService,
    {
      provide: 'DOCUMENT_LOADER_REGISTRY',
      useFactory: (
        documentLoader: DocumentLoaderService,
        pdfLoader: PDFLoaderService,
        csvLoader: CSVLoaderService,
        textLoader: TextLoaderService,
        unstructuredLoader: UnstructuredLoaderService,
      ) => {
        // Register all loaders
        documentLoader.registerLoader(DocumentFormat.PDF, pdfLoader);
        documentLoader.registerLoader(DocumentFormat.CSV, csvLoader);
        documentLoader.registerLoader(DocumentFormat.TEXT, textLoader);
        documentLoader.registerLoader(DocumentFormat.MARKDOWN, textLoader);
        documentLoader.registerLoader(DocumentFormat.DOCX, unstructuredLoader);
        documentLoader.registerLoader(DocumentFormat.XLSX, unstructuredLoader);
        documentLoader.registerLoader(DocumentFormat.UNSTRUCTURED, unstructuredLoader);

        return documentLoader;
      },
      inject: [DocumentLoaderService, PDFLoaderService, CSVLoaderService, TextLoaderService, UnstructuredLoaderService],
    },
  ],
  exports: [
    DocumentLoaderService,
    DocumentChunkingService,
    MetadataExtractionService,
    DocumentVersioningService,
    DocumentTransformationService,
    DocumentPipelineService,
    DocumentVectorIntegrationService,
    PDFLoaderService,
    CSVLoaderService,
    TextLoaderService,
    UnstructuredLoaderService,
  ],
})
export class DocumentsModule {}
