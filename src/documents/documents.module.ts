import { Module } from '@nestjs/common';
import { DocumentLoaderService } from './services/document-loader.service';
import { DocumentChunkingService } from './services/document-chunking.service';
import { PDFLoaderService } from './loaders/pdf-loader.service';
import { CSVLoaderService } from './loaders/csv-loader.service';
import { TextLoaderService } from './loaders/text-loader.service';
import { UnstructuredLoaderService } from './loaders/unstructured-loader.service';
import { DocumentFormat } from './interfaces/document-loader.interface';

@Module({
  providers: [
    DocumentLoaderService,
    DocumentChunkingService,
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
      inject: [
        DocumentLoaderService,
        PDFLoaderService,
        CSVLoaderService,
        TextLoaderService,
        UnstructuredLoaderService,
      ],
    },
  ],
  exports: [
    DocumentLoaderService,
    DocumentChunkingService,
    PDFLoaderService,
    CSVLoaderService,
    TextLoaderService,
    UnstructuredLoaderService,
  ],
})
export class DocumentsModule {}