import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DocumentFormat, DocumentLoaderConfig } from '../interfaces/document-loader.interface';
import { DocumentLoaderService } from './document-loader.service';

jest.mock('fs/promises');

describe('DocumentLoaderService', () => {
  let service: DocumentLoaderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentLoaderService],
    }).compile();

    service = module.get<DocumentLoaderService>(DocumentLoaderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectFormat', () => {
    it('should detect format from file extension', async () => {
      const format = await service.detectFormat('/path/to/file.pdf');
      expect(format).toBe(DocumentFormat.PDF);
    });

    it('should detect CSV format from extension', async () => {
      const format = await service.detectFormat('/path/to/data.csv');
      expect(format).toBe(DocumentFormat.CSV);
    });

    it('should detect format from buffer content - PDF', async () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
      const format = await service.detectFormat(pdfBuffer);
      expect(format).toBe(DocumentFormat.PDF);
    });

    it('should detect format from buffer content - JSON', async () => {
      const jsonBuffer = Buffer.from('{"key": "value"}');
      const format = await service.detectFormat(jsonBuffer);
      expect(format).toBe(DocumentFormat.JSON);
    });

    it('should detect CSV from content pattern', async () => {
      const csvBuffer = Buffer.from('header1,header2,header3\nvalue1,value2,value3\nvalue4,value5,value6');
      const format = await service.detectFormat(csvBuffer);
      expect(format).toBe(DocumentFormat.CSV);
    });

    it('should detect Markdown from content pattern', async () => {
      const mdBuffer = Buffer.from('# Header\n\n## Subheader\n\n* List item\n* Another item\n\n[Link](http://example.com)');
      const format = await service.detectFormat(mdBuffer);
      expect(format).toBe(DocumentFormat.MARKDOWN);
    });

    it('should return null for unknown format', async () => {
      const format = await service.detectFormat('/path/to/file.xyz');
      expect(format).toBeNull();
    });

    it('should default to TEXT for valid UTF-8 content', async () => {
      const textBuffer = Buffer.from('Just some plain text content');
      const format = await service.detectFormat(textBuffer);
      expect(format).toBe(DocumentFormat.TEXT);
    });

    it('should detect UNSTRUCTURED for binary content', async () => {
      const binaryBuffer = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02]);
      const format = await service.detectFormat(binaryBuffer);
      expect(format).toBe(DocumentFormat.UNSTRUCTURED);
    });
  });

  describe('validate', () => {
    it('should validate a valid file', async () => {
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: 1024,
      });

      const result = await service.validate('/path/to/file.txt');

      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.fileSize).toBe(1024);
    });

    it('should reject files exceeding max size', async () => {
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: 200 * 1024 * 1024, // 200MB
      });

      const result = await service.validate('/path/to/large-file.txt');

      expect(result.isValid).toBe(false);
      expect(result.errors?.[0]).toContain('exceeds maximum');
    });

    it('should reject non-file paths', async () => {
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => false,
        size: 0,
      });

      const result = await service.validate('/path/to/directory');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Source is not a file');
    });

    it('should handle file not found errors', async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await service.validate('/path/to/nonexistent.txt');

      expect(result.isValid).toBe(false);
      expect(result.errors?.[0]).toContain('not found');
    });

    it('should validate buffer input', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.validate(buffer);

      expect(result.isValid).toBe(true);
      expect(result.fileSize).toBe(buffer.length);
    });

    it('should reject oversized buffers', async () => {
      const buffer = Buffer.alloc(200 * 1024 * 1024); // 200MB
      const result = await service.validate(buffer);

      expect(result.isValid).toBe(false);
      expect(result.errors?.[0]).toContain('exceeds maximum');
    });
  });

  describe('load', () => {
    it('should load a simple text file', async () => {
      const content = 'This is test content';
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: content.length,
      });
      (fs.readFile as jest.Mock).mockResolvedValue(content);

      const config: DocumentLoaderConfig = {
        source: '/path/to/file.txt',
        format: DocumentFormat.TEXT,
        metadata: { custom: 'value' },
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].pageContent).toBe(content);
      expect(result.documents[0].metadata.custom).toBe('value');
      expect(result.documents[0].metadata.format).toBe(DocumentFormat.TEXT);
      expect(result.metadata.documentCount).toBe(1);
      expect(result.metadata.totalCharacters).toBe(content.length);
    });

    it('should load from buffer', async () => {
      const content = 'Buffer content';
      const buffer = Buffer.from(content);

      const config: DocumentLoaderConfig = {
        source: buffer,
        format: DocumentFormat.TEXT,
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].pageContent).toBe(content);
      expect(result.metadata.source).toBe('buffer');
    });

    it('should auto-detect format if not provided', async () => {
      const content = '{"key": "value"}';
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: content.length,
      });
      (fs.readFile as jest.Mock).mockResolvedValue(content);

      const config: DocumentLoaderConfig = {
        source: '/path/to/file.json',
      };

      const result = await service.load(config);

      expect(result.documents[0].metadata.format).toBe(DocumentFormat.JSON);
    });

    it('should throw error for invalid documents', async () => {
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => false,
        size: 0,
      });

      const config: DocumentLoaderConfig = {
        source: '/path/to/directory',
      };

      await expect(service.load(config)).rejects.toThrow('Document validation failed');
    });

    it('should include loading time in metadata', async () => {
      const content = 'Test content';
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: content.length,
      });
      (fs.readFile as jest.Mock).mockResolvedValue(content);

      const config: DocumentLoaderConfig = {
        source: '/path/to/file.txt',
        format: DocumentFormat.TEXT,
      };

      const result = await service.load(config);

      expect(result.metadata.loadingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.loadingTime).toBe('number');
    });
  });

  describe('getSupportedFormats', () => {
    it('should return base supported formats', () => {
      const formats = service.getSupportedFormats();

      expect(formats).toContain(DocumentFormat.TEXT);
      expect(formats).toContain(DocumentFormat.JSON);
      expect(formats).toContain(DocumentFormat.MARKDOWN);
      expect(formats).toContain(DocumentFormat.HTML);
    });
  });

  describe('generateDocumentId', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'Test content for hashing';
      // Access protected method through any type cast
      const id1 = (service as any).generateDocumentId(content);
      const id2 = (service as any).generateDocumentId(content);

      expect(id1).toBe(id2);
      expect(id1).toHaveLength(16);
    });

    it('should generate different hashes for different content', () => {
      const id1 = (service as any).generateDocumentId('Content 1');
      const id2 = (service as any).generateDocumentId('Content 2');

      expect(id1).not.toBe(id2);
    });
  });

  describe('extractBasicMetadata', () => {
    it('should extract word and line counts', () => {
      const content = 'This is a test.\nSecond line here.\nThird line.';
      const metadata = (service as any).extractBasicMetadata(content);

      expect(metadata.wordCount).toBe(9);
      expect(metadata.lineCount).toBe(3);
      expect(metadata.characterCount).toBe(content.length);
    });

    it('should detect URLs in content', () => {
      const content = 'Check out https://example.com for more info';
      const metadata = (service as any).extractBasicMetadata(content);

      expect(metadata.hasUrls).toBe(true);
    });

    it('should detect emails in content', () => {
      const content = 'Contact us at test@example.com';
      const metadata = (service as any).extractBasicMetadata(content);

      expect(metadata.hasEmails).toBe(true);
    });

    it('should detect numbers in content', () => {
      const content = 'There are 42 items in stock';
      const metadata = (service as any).extractBasicMetadata(content);

      expect(metadata.hasNumbers).toBe(true);
    });

    it('should calculate average line length', () => {
      const content = '12345\n1234567890\n12345';
      const metadata = (service as any).extractBasicMetadata(content);

      expect(metadata.avgLineLength).toBe(7); // (5 + 10 + 5) / 3 = 6.67 -> 7
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      const content = '';
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: 0,
      });
      (fs.readFile as jest.Mock).mockResolvedValue(content);

      const config: DocumentLoaderConfig = {
        source: '/path/to/empty.txt',
        format: DocumentFormat.TEXT,
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].pageContent).toBe('');
      expect(result.metadata.totalCharacters).toBe(0);
    });

    it('should handle files with only whitespace', async () => {
      const content = '   \n  \t  \n   ';
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: content.length,
      });
      (fs.readFile as jest.Mock).mockResolvedValue(content);

      const config: DocumentLoaderConfig = {
        source: '/path/to/whitespace.txt',
      };

      const result = await service.load(config);

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].pageContent).toBe(content);
    });

    it('should handle special characters in file paths', async () => {
      const content = 'Test';
      const specialPath = '/path/with spaces/and-special_chars!.txt';
      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: content.length,
      });
      (fs.readFile as jest.Mock).mockResolvedValue(content);

      const config: DocumentLoaderConfig = {
        source: specialPath,
      };

      const result = await service.load(config);

      expect(result.metadata.source).toBe(specialPath);
    });

    it('should handle concurrent loads', async () => {
      const content1 = 'Content 1';
      const content2 = 'Content 2';

      (fs.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        size: 10,
      });
      (fs.readFile as jest.Mock).mockResolvedValueOnce(content1).mockResolvedValueOnce(content2);

      const config1: DocumentLoaderConfig = {
        source: '/path/to/file1.txt',
      };
      const config2: DocumentLoaderConfig = {
        source: '/path/to/file2.txt',
      };

      const [result1, result2] = await Promise.all([service.load(config1), service.load(config2)]);

      expect(result1.documents[0].pageContent).toBe(content1);
      expect(result2.documents[0].pageContent).toBe(content2);
    });
  });
});
