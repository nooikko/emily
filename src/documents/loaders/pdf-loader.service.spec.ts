import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import { DocumentFormat, DocumentLoaderConfig } from '../interfaces/document-loader.interface';
import { PDFLoaderService } from './pdf-loader.service';

// Mock LangChain PDFLoader
jest.mock('@langchain/community/document_loaders/fs/pdf', () => ({
  PDFLoader: jest.fn().mockImplementation((path, options) => ({
    load: jest.fn().mockResolvedValue([
      {
        pageContent: 'Page 1 content',
        metadata: { page: 1 },
      },
      {
        pageContent: 'Page 2 content',
        metadata: { page: 2 },
      },
    ]),
  })),
}));

jest.mock('fs/promises');

describe('PDFLoaderService', () => {
  let service: PDFLoaderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PDFLoaderService],
    }).compile();

    service = module.get<PDFLoaderService>(PDFLoaderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('load', () => {
    it('should load PDF from file path', async () => {
      const filePath = '/path/to/document.pdf';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
        metadata: { custom: 'value' },
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(2);
      expect(result.documents[0].pageContent).toBe('Page 1 content');
      expect(result.documents[0].metadata.pageNumber).toBe(1);
      expect(result.documents[0].metadata.totalPages).toBe(2);
      expect(result.documents[0].metadata.custom).toBe('value');
      expect(result.documents[0].metadata.format).toBe(DocumentFormat.PDF);
      expect(result.metadata.documentCount).toBe(2);
    });

    it('should load PDF from buffer', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 content');
      const tempPath = '/tmp/pdf_123456.pdf';

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({
        size: pdfBuffer.length,
      });
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      const config: DocumentLoaderConfig = {
        source: pdfBuffer,
      };

      const result = await service.load(config);

      expect(fs.writeFile).toHaveBeenCalled();
      expect(result.documents).toHaveLength(2);
      expect(result.metadata.source).toBe('buffer');
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should handle splitPages option', async () => {
      const filePath = '/path/to/document.pdf';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
        loaderOptions: {
          splitPages: false,
        },
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(2);
      expect(result.documents[0].metadata.pageNumber).toBeUndefined();
    });

    it('should calculate total characters correctly', async () => {
      const filePath = '/path/to/document.pdf';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
      };

      const result = await service.load(config);

      const expectedChars = 'Page 1 content'.length + 'Page 2 content'.length;
      expect(result.metadata.totalCharacters).toBe(expectedChars);
    });

    it('should clean up temp file even if loading fails', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 content');

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Stat failed'));
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      const config: DocumentLoaderConfig = {
        source: pdfBuffer,
      };

      await expect(service.load(config)).rejects.toThrow('Stat failed');
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should handle temp file deletion failure gracefully', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 content');

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({
        size: pdfBuffer.length,
      });
      (fs.unlink as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const config: DocumentLoaderConfig = {
        source: pdfBuffer,
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(2);
      // Should not throw even if unlink fails
    });

    it('should include loading time in metadata', async () => {
      const filePath = '/path/to/document.pdf';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
      };

      const result = await service.load(config);

      expect(result.metadata.loadingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.loadingTime).toBe('number');
    });
  });

  describe('validate', () => {
    it('should validate valid PDF file', async () => {
      const filePath = '/path/to/document.pdf';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
      });
      (fs.open as jest.Mock).mockResolvedValue({
        read: jest.fn().mockImplementation((buffer) => {
          // Simulate PDF signature
          buffer[0] = 0x25; // %
          buffer[1] = 0x50; // P
          buffer[2] = 0x44; // D
          buffer[3] = 0x46; // F
          return Promise.resolve();
        }),
        close: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.validate(filePath);

      expect(result.isValid).toBe(true);
      expect(result.detectedFormat).toBe(DocumentFormat.PDF);
      expect(result.mimeType).toBe('application/pdf');
    });

    it('should validate PDF buffer', async () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

      const result = await service.validate(pdfBuffer);

      expect(result.isValid).toBe(true);
      expect(result.detectedFormat).toBe(DocumentFormat.PDF);
      expect(result.fileSize).toBe(pdfBuffer.length);
    });

    it('should reject non-PDF files', async () => {
      const filePath = '/path/to/document.txt';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
      });
      (fs.open as jest.Mock).mockResolvedValue({
        read: jest.fn().mockImplementation((buffer) => {
          // Not a PDF signature
          buffer[0] = 0x54; // T
          buffer[1] = 0x45; // E
          buffer[2] = 0x58; // X
          buffer[3] = 0x54; // T
          return Promise.resolve();
        }),
        close: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.validate(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid PDF signature');
    });

    it('should reject oversized PDFs', async () => {
      const filePath = '/path/to/large.pdf';
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 200 * 1024 * 1024, // 200MB
      });
      (fs.open as jest.Mock).mockResolvedValue({
        read: jest.fn().mockImplementation((buffer) => {
          buffer[0] = 0x25;
          buffer[1] = 0x50;
          buffer[2] = 0x44;
          buffer[3] = 0x46;
          return Promise.resolve();
        }),
        close: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.validate(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors?.[0]).toContain('exceeds maximum');
    });

    it('should handle validation errors gracefully', async () => {
      const filePath = '/path/to/nonexistent.pdf';
      (fs.stat as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await service.validate(filePath);

      expect(result.isValid).toBe(false);
      expect(result.errors?.[0]).toContain('Validation error');
    });
  });

  describe('detectFormat', () => {
    it('should detect PDF format for valid PDF', async () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

      const format = await service.detectFormat(pdfBuffer);

      expect(format).toBe(DocumentFormat.PDF);
    });

    it('should return null for non-PDF', async () => {
      const textBuffer = Buffer.from('This is not a PDF');

      const format = await service.detectFormat(textBuffer);

      expect(format).toBeNull();
    });

    it('should handle detection errors gracefully', async () => {
      // Mock validate to throw
      jest.spyOn(service, 'validate').mockRejectedValue(new Error('Validation failed'));

      const format = await service.detectFormat('test.pdf');

      expect(format).toBeNull();
    });
  });

  describe('getSupportedFormats', () => {
    it('should return PDF format', () => {
      const formats = service.getSupportedFormats();

      expect(formats).toEqual([DocumentFormat.PDF]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty PDF', async () => {
      const filePath = '/path/to/empty.pdf';

      // Mock PDFLoader to return empty array
      const PDFLoader = require('@langchain/community/document_loaders/fs/pdf').PDFLoader;
      PDFLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue([]),
      }));

      (fs.stat as jest.Mock).mockResolvedValue({
        size: 100,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(0);
      expect(result.metadata.documentCount).toBe(0);
      expect(result.metadata.totalCharacters).toBe(0);
    });

    it('should handle single-page PDF', async () => {
      const filePath = '/path/to/single-page.pdf';

      const PDFLoader = require('@langchain/community/document_loaders/fs/pdf').PDFLoader;
      PDFLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue([
          {
            pageContent: 'Single page content',
            metadata: { page: 1 },
          },
        ]),
      }));

      (fs.stat as jest.Mock).mockResolvedValue({
        size: 512,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].metadata.pageNumber).toBe(1);
      expect(result.documents[0].metadata.totalPages).toBe(1);
    });

    it('should handle PDF with special characters in content', async () => {
      const filePath = '/path/to/special.pdf';

      const PDFLoader = require('@langchain/community/document_loaders/fs/pdf').PDFLoader;
      PDFLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue([
          {
            pageContent: 'Content with émojis 🎉 and spëcial çhars',
            metadata: { page: 1 },
          },
        ]),
      }));

      (fs.stat as jest.Mock).mockResolvedValue({
        size: 512,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
      };

      const result = await service.load(config);

      expect(result.documents[0].pageContent).toBe('Content with émojis 🎉 and spëcial çhars');
    });

    it('should preserve metadata from PDFLoader', async () => {
      const filePath = '/path/to/metadata.pdf';

      const PDFLoader = require('@langchain/community/document_loaders/fs/pdf').PDFLoader;
      PDFLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue([
          {
            pageContent: 'Content',
            metadata: {
              page: 1,
              author: 'Test Author',
              title: 'Test Title',
              creationDate: '2024-01-01',
            },
          },
        ]),
      }));

      (fs.stat as jest.Mock).mockResolvedValue({
        size: 512,
      });

      const config: DocumentLoaderConfig = {
        source: filePath,
      };

      const result = await service.load(config);

      expect(result.documents[0].metadata.author).toBe('Test Author');
      expect(result.documents[0].metadata.title).toBe('Test Title');
      expect(result.documents[0].metadata.creationDate).toBe('2024-01-01');
    });
  });
});
