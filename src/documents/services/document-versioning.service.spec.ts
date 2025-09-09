import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentVersioningService } from './document-versioning.service';

describe('DocumentVersioningService', () => {
  let service: DocumentVersioningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentVersioningService],
    }).compile();

    service = module.get<DocumentVersioningService>(DocumentVersioningService);
  });

  describe('createVersion', () => {
    it('should create a new version for a document', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: { source: 'test.txt' },
      });

      const version = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });

      expect(version).toBeDefined();
      expect(version.versionNumber).toBe(1);
      expect(version.document.pageContent).toBe('Test content');
      expect(version.metadata.changeType).toBe('create');
      expect(version.metadata.validFrom).toBeInstanceOf(Date);
      expect(version.metadata.validTo).toBeUndefined();
    });

    it('should increment version number for existing document', async () => {
      const document = new Document({
        pageContent: 'Initial content',
        metadata: { documentId: 'test-doc-1' },
      });

      const version1 = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });

      const updatedDocument = new Document({
        pageContent: 'Updated content',
        metadata: { documentId: 'test-doc-1' },
      });

      const version2 = await service.createVersion(updatedDocument, { enabled: true, strategy: 'timestamp' });

      expect(version2.versionNumber).toBe(2);
      expect(version2.metadata.changeType).toBe('update');
      expect(version2.metadata.previousVersionId).toBe(version1.versionId);
    });

    it('should not create duplicate versions for identical content', async () => {
      const document = new Document({
        pageContent: 'Same content',
        metadata: { documentId: 'test-doc-2' },
      });

      const version1 = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });
      const version2 = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });

      expect(version2.versionId).toBe(version1.versionId);
      expect(version2.versionNumber).toBe(version1.versionNumber);
    });

    it('should generate version ID based on strategy', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: {},
      });

      const hashVersion = await service.createVersion(document, { enabled: true, strategy: 'hash' });
      expect(hashVersion.versionId).toMatch(/^doc_.*_v1_[a-f0-9]{8}$/);

      const incrementalVersion = await service.createVersion(new Document({ pageContent: 'Different content', metadata: {} }), {
        enabled: true,
        strategy: 'incremental',
      });
      expect(incrementalVersion.versionId).toMatch(/^doc_.*_v1$/);
    });

    it('should throw error when versioning is disabled', async () => {
      const document = new Document({ pageContent: 'Test' });

      await expect(service.createVersion(document, { enabled: false, strategy: 'timestamp' })).rejects.toThrow('Versioning is not enabled');
    });
  });

  describe('getVersion', () => {
    it('should retrieve a specific version', async () => {
      const document = new Document({
        pageContent: 'Test content',
        metadata: { documentId: 'test-doc-3' },
      });

      const created = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });
      const retrieved = await service.getVersion('test-doc-3', created.versionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.versionId).toBe(created.versionId);
      expect(retrieved?.document.pageContent).toBe('Test content');
    });

    it('should return current version when no versionId specified', async () => {
      const document = new Document({
        pageContent: 'Current content',
        metadata: { documentId: 'test-doc-4' },
      });

      const created = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });
      const current = await service.getVersion('test-doc-4');

      expect(current).toBeDefined();
      expect(current?.versionId).toBe(created.versionId);
    });

    it('should return null for non-existent document', async () => {
      const version = await service.getVersion('non-existent-doc');
      expect(version).toBeNull();
    });
  });

  describe('getVersionHistory', () => {
    it('should return version history in reverse chronological order', async () => {
      const documentId = 'test-doc-5';

      const v1 = await service.createVersion(new Document({ pageContent: 'Version 1', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different timestamps

      const v2 = await service.createVersion(new Document({ pageContent: 'Version 2', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const v3 = await service.createVersion(new Document({ pageContent: 'Version 3', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      const history = await service.getVersionHistory(documentId);

      expect(history).toHaveLength(3);
      expect(history[0].versionId).toBe(v3.versionId);
      expect(history[1].versionId).toBe(v2.versionId);
      expect(history[2].versionId).toBe(v1.versionId);
    });

    it('should respect limit parameter', async () => {
      const documentId = 'test-doc-6';

      for (let i = 1; i <= 5; i++) {
        await service.createVersion(new Document({ pageContent: `Version ${i}`, metadata: { documentId } }), {
          enabled: true,
          strategy: 'timestamp',
        });
      }

      const history = await service.getVersionHistory(documentId, 3);
      expect(history).toHaveLength(3);
    });

    it('should return empty array for non-existent document', async () => {
      const history = await service.getVersionHistory('non-existent');
      expect(history).toEqual([]);
    });
  });

  describe('getVersionByTimestamp', () => {
    it('should find version valid at given timestamp', async () => {
      const documentId = 'test-doc-7';

      const v1 = await service.createVersion(new Document({ pageContent: 'Version 1', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      const middleTime = new Date();
      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.createVersion(new Document({ pageContent: 'Version 2', metadata: { documentId } }), { enabled: true, strategy: 'timestamp' });

      const versionAtMiddle = await service.getVersionByTimestamp(documentId, middleTime);
      expect(versionAtMiddle?.versionId).toBe(v1.versionId);
    });

    it('should return null for timestamp before any versions', async () => {
      const documentId = 'test-doc-8';
      const pastTime = new Date(Date.now() - 10000);

      await service.createVersion(new Document({ pageContent: 'Version 1', metadata: { documentId } }), { enabled: true, strategy: 'timestamp' });

      const version = await service.getVersionByTimestamp(documentId, pastTime);
      expect(version).toBeNull();
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions and return differences', async () => {
      const documentId = 'test-doc-9';

      const v1 = await service.createVersion(
        new Document({
          pageContent: 'Line 1\nLine 2\nLine 3',
          metadata: { documentId, author: 'Alice' },
        }),
        { enabled: true, strategy: 'timestamp' },
      );

      const v2 = await service.createVersion(
        new Document({
          pageContent: 'Line 1\nLine 2 modified\nLine 3\nLine 4',
          metadata: { documentId, author: 'Bob', reviewer: 'Charlie' },
        }),
        { enabled: true, strategy: 'timestamp' },
      );

      const comparison = await service.compareVersions(documentId, v1.versionId, v2.versionId);

      expect(comparison.differences.content.added).toContain('Line 2 modified');
      expect(comparison.differences.content.added).toContain('Line 4');
      expect(comparison.differences.content.removed).toContain('Line 2');
      expect(comparison.differences.metadata.added).toHaveProperty('reviewer', 'Charlie');
      expect(comparison.differences.metadata.modified).toHaveProperty('author');
      expect(comparison.similarity).toBeGreaterThan(0);
      expect(comparison.similarity).toBeLessThan(1);
    });

    it('should return similarity of 1 for identical versions', async () => {
      const documentId = 'test-doc-10';

      const v1 = await service.createVersion(new Document({ pageContent: 'Same content', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      const comparison = await service.compareVersions(documentId, v1.versionId, v1.versionId);
      expect(comparison.similarity).toBe(1);
    });

    it('should throw error for non-existent versions', async () => {
      await expect(service.compareVersions('doc', 'v1', 'v2')).rejects.toThrow('One or both versions not found');
    });
  });

  describe('rollbackToVersion', () => {
    it('should create new version from previous version', async () => {
      const documentId = 'test-doc-11';

      const v1 = await service.createVersion(new Document({ pageContent: 'Original content', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      await service.createVersion(new Document({ pageContent: 'Modified content', metadata: { documentId } }), {
        enabled: true,
        strategy: 'timestamp',
      });

      const rollback = await service.rollbackToVersion(documentId, v1.versionId);

      expect(rollback.document.pageContent).toBe('Original content');
      expect(rollback.versionNumber).toBe(3);
      expect(rollback.metadata.changeReason).toContain('Rollback');
    });

    it('should throw error for non-existent version', async () => {
      await expect(service.rollbackToVersion('doc', 'non-existent')).rejects.toThrow('Version non-existent not found');
    });
  });

  describe('pruneVersions', () => {
    it('should keep only specified number of recent versions', async () => {
      const documentId = 'test-doc-12';

      for (let i = 1; i <= 5; i++) {
        await service.createVersion(new Document({ pageContent: `Version ${i}`, metadata: { documentId } }), {
          enabled: true,
          strategy: 'timestamp',
        });
      }

      const prunedCount = await service.pruneVersions(documentId, 2);
      const history = await service.getVersionHistory(documentId);

      expect(prunedCount).toBe(3);
      expect(history).toHaveLength(2);
      expect(history[0].document.pageContent).toBe('Version 5');
      expect(history[1].document.pageContent).toBe('Version 4');
    });

    it('should not prune if versions <= maxVersions', async () => {
      const documentId = 'test-doc-13';

      await service.createVersion(new Document({ pageContent: 'Version 1', metadata: { documentId } }), { enabled: true, strategy: 'timestamp' });

      const prunedCount = await service.pruneVersions(documentId, 5);
      expect(prunedCount).toBe(0);
    });

    it('should return 0 for non-existent document', async () => {
      const prunedCount = await service.pruneVersions('non-existent', 1);
      expect(prunedCount).toBe(0);
    });
  });

  describe('findDocumentByHash', () => {
    it('should find document ID by content hash', async () => {
      const document = new Document({
        pageContent: 'Unique content for hash test',
        metadata: { documentId: 'hash-test-doc' },
      });

      const version = await service.createVersion(document, { enabled: true, strategy: 'timestamp' });
      const foundId = await service.findDocumentByHash(version.hash);

      expect(foundId).toBe('hash-test-doc');
    });

    it('should return null for unknown hash', async () => {
      const foundId = await service.findDocumentByHash('unknown-hash');
      expect(foundId).toBeNull();
    });
  });

  describe('getDocumentStats', () => {
    it('should calculate document statistics', async () => {
      const documentId = 'test-doc-14';

      await service.createVersion(
        new Document({ pageContent: 'Version 1', metadata: { documentId } }),
        { enabled: true, strategy: 'timestamp' },
        { createdBy: 'Alice', changeType: 'create' },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.createVersion(
        new Document({ pageContent: 'Version 2 with more content', metadata: { documentId } }),
        { enabled: true, strategy: 'timestamp' },
        { createdBy: 'Bob', changeType: 'update' },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.createVersion(
        new Document({ pageContent: 'Version 3', metadata: { documentId } }),
        { enabled: true, strategy: 'timestamp' },
        { createdBy: 'Alice', changeType: 'update' },
      );

      const stats = await service.getDocumentStats(documentId);

      expect(stats).toBeDefined();
      expect(stats?.totalVersions).toBe(3);
      expect(stats?.averageTimeBetweenVersions).toBeGreaterThan(0);
      expect(stats?.mostFrequentChangeType).toBe('update');
      expect(stats?.uniqueContributors).toContain('Alice');
      expect(stats?.uniqueContributors).toContain('Bob');
      expect(stats?.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should return null for non-existent document', async () => {
      const stats = await service.getDocumentStats('non-existent');
      expect(stats).toBeNull();
    });
  });

  describe('version limit enforcement', () => {
    it('should respect maxVersions configuration', async () => {
      const documentId = 'test-doc-15';
      const config = { enabled: true, strategy: 'timestamp' as const, maxVersions: 3 };

      for (let i = 1; i <= 5; i++) {
        await service.createVersion(new Document({ pageContent: `Version ${i}`, metadata: { documentId } }), config);
      }

      const history = await service.getVersionHistory(documentId);
      expect(history).toHaveLength(3);
      expect(history[0].document.pageContent).toBe('Version 5');
      expect(history[2].document.pageContent).toBe('Version 3');
    });
  });

  describe('metadata preservation', () => {
    it('should preserve and track metadata changes', async () => {
      const documentId = 'test-doc-16';

      const v1 = await service.createVersion(
        new Document({
          pageContent: 'Content',
          metadata: {
            documentId,
            tags: ['draft'],
            category: 'technical',
          },
        }),
        { enabled: true, strategy: 'timestamp' },
      );

      const v2 = await service.createVersion(
        new Document({
          pageContent: 'Content',
          metadata: {
            documentId,
            tags: ['draft', 'reviewed'],
            category: 'technical',
            status: 'pending',
          },
        }),
        { enabled: true, strategy: 'timestamp' },
      );

      const comparison = await service.compareVersions(documentId, v1.versionId, v2.versionId);

      expect(comparison.differences.metadata.added).toHaveProperty('status', 'pending');
      expect(comparison.differences.metadata.modified).toHaveProperty('tags');
    });
  });
});
