import * as crypto from 'node:crypto';
import { Document } from '@langchain/core/documents';
import { Injectable, Logger } from '@nestjs/common';
import { type DocumentVersioningConfig } from '../interfaces/document-loader.interface';

export interface DocumentVersion {
  versionId: string;
  versionNumber: number;
  timestamp: Date;
  hash: string;
  document: Document;
  metadata: {
    validFrom: Date;
    validTo?: Date;
    createdBy?: string;
    changeType: 'create' | 'update' | 'delete';
    changeReason?: string;
    previousVersionId?: string;
  };
}

export interface VersionedDocument {
  documentId: string;
  currentVersion: DocumentVersion;
  versions: DocumentVersion[];
  metadata: {
    totalVersions: number;
    firstVersion: Date;
    lastModified: Date;
    documentType?: string;
    tags?: string[];
  };
}

export interface VersionComparisonResult {
  versionA: string;
  versionB: string;
  differences: {
    content: {
      added: string[];
      removed: string[];
      modified: string[];
    };
    metadata: {
      added: Record<string, any>;
      removed: Record<string, any>;
      modified: Record<string, { old: any; new: any }>;
    };
  };
  similarity: number;
  changeStats: {
    contentChanges: number;
    metadataChanges: number;
    totalChanges: number;
  };
}

@Injectable()
export class DocumentVersioningService {
  private readonly logger = new Logger(DocumentVersioningService.name);
  private readonly versionStore = new Map<string, VersionedDocument>();
  private readonly hashIndex = new Map<string, string>(); // hash -> documentId mapping for deduplication

  constructor() {
    this.logger.log('DocumentVersioningService initialized');
  }

  async createVersion(
    document: Document,
    config: DocumentVersioningConfig = { enabled: true, strategy: 'timestamp' },
    metadata?: {
      createdBy?: string;
      changeReason?: string;
      changeType?: 'create' | 'update' | 'delete';
    },
  ): Promise<DocumentVersion> {
    if (!config.enabled) {
      throw new Error('Versioning is not enabled');
    }

    const hash = this.generateDocumentHash(document);
    const documentId = this.getOrCreateDocumentId(document, hash);
    const versionedDoc = this.versionStore.get(documentId);
    const timestamp = new Date();

    // Check for duplicate versions (same hash)
    if (versionedDoc && this.isDuplicateVersion(versionedDoc, hash)) {
      this.logger.debug(`Duplicate version detected for document ${documentId}, skipping`);
      return versionedDoc.currentVersion;
    }

    const versionNumber = versionedDoc ? versionedDoc.versions.length + 1 : 1;
    const versionId = this.generateVersionId(documentId, versionNumber, config.strategy, hash, timestamp);

    // Update previous version's validTo if exists
    if (versionedDoc?.currentVersion) {
      versionedDoc.currentVersion.metadata.validTo = timestamp;
    }

    const newVersion: DocumentVersion = {
      versionId,
      versionNumber,
      timestamp,
      hash,
      document: this.cloneDocument(document),
      metadata: {
        validFrom: timestamp,
        validTo: undefined,
        createdBy: metadata?.createdBy,
        changeType: metadata?.changeType || (versionedDoc ? 'update' : 'create'),
        changeReason: metadata?.changeReason,
        previousVersionId: versionedDoc?.currentVersion?.versionId,
      },
    };

    this.storeVersion(documentId, newVersion, config);
    this.hashIndex.set(hash, documentId);

    return newVersion;
  }

  async getVersion(documentId: string, versionId?: string): Promise<DocumentVersion | null> {
    const versionedDoc = this.versionStore.get(documentId);
    if (!versionedDoc) {
      return null;
    }

    if (!versionId) {
      return versionedDoc.currentVersion;
    }

    return versionedDoc.versions.find((v) => v.versionId === versionId) || null;
  }

  async getVersionHistory(documentId: string, limit?: number): Promise<DocumentVersion[]> {
    const versionedDoc = this.versionStore.get(documentId);
    if (!versionedDoc) {
      return [];
    }

    const versions = [...versionedDoc.versions].reverse(); // Most recent first
    return limit ? versions.slice(0, limit) : versions;
  }

  async getVersionByTimestamp(documentId: string, timestamp: Date): Promise<DocumentVersion | null> {
    const versionedDoc = this.versionStore.get(documentId);
    if (!versionedDoc) {
      return null;
    }

    // Find version that was valid at the given timestamp
    return (
      versionedDoc.versions.find((v) => {
        const validFrom = v.metadata.validFrom;
        const validTo = v.metadata.validTo || new Date();
        return timestamp >= validFrom && timestamp <= validTo;
      }) || null
    );
  }

  async compareVersions(documentId: string, versionIdA: string, versionIdB: string): Promise<VersionComparisonResult> {
    const versionA = await this.getVersion(documentId, versionIdA);
    const versionB = await this.getVersion(documentId, versionIdB);

    if (!versionA || !versionB) {
      throw new Error('One or both versions not found');
    }

    const contentDiff = this.compareContent(versionA.document.pageContent, versionB.document.pageContent);
    const metadataDiff = this.compareMetadata(versionA.document.metadata, versionB.document.metadata);

    const similarity = this.calculateSimilarity(versionA.document.pageContent, versionB.document.pageContent);

    return {
      versionA: versionIdA,
      versionB: versionIdB,
      differences: {
        content: contentDiff,
        metadata: metadataDiff,
      },
      similarity,
      changeStats: {
        contentChanges: contentDiff.added.length + contentDiff.removed.length + contentDiff.modified.length,
        metadataChanges:
          Object.keys(metadataDiff.added).length + Object.keys(metadataDiff.removed).length + Object.keys(metadataDiff.modified).length,
        totalChanges: 0, // Will be calculated
      },
    };
  }

  async rollbackToVersion(documentId: string, versionId: string): Promise<DocumentVersion> {
    const targetVersion = await this.getVersion(documentId, versionId);
    if (!targetVersion) {
      throw new Error(`Version ${versionId} not found`);
    }

    // Create a new version that's a copy of the target version
    const rollbackVersion = await this.createVersion(
      targetVersion.document,
      { enabled: true, strategy: 'timestamp' },
      {
        changeType: 'update',
        changeReason: `Rollback to version ${versionId}`,
      },
    );

    this.logger.log(`Document ${documentId} rolled back to version ${versionId}`);
    return rollbackVersion;
  }

  async pruneVersions(documentId: string, maxVersions: number): Promise<number> {
    const versionedDoc = this.versionStore.get(documentId);
    if (!versionedDoc) {
      return 0;
    }

    const versionsToKeep = Math.max(1, maxVersions);
    const currentVersionCount = versionedDoc.versions.length;

    if (currentVersionCount <= versionsToKeep) {
      return 0;
    }

    // Keep the most recent versions
    const prunedVersions = versionedDoc.versions.slice(0, currentVersionCount - versionsToKeep);
    versionedDoc.versions = versionedDoc.versions.slice(currentVersionCount - versionsToKeep);

    // Update metadata
    versionedDoc.metadata.totalVersions = versionedDoc.versions.length;
    if (versionedDoc.versions.length > 0) {
      versionedDoc.metadata.firstVersion = versionedDoc.versions[0].timestamp;
    }

    const prunedCount = prunedVersions.length;
    this.logger.log(`Pruned ${prunedCount} versions from document ${documentId}`);
    return prunedCount;
  }

  async findDocumentByHash(hash: string): Promise<string | null> {
    return this.hashIndex.get(hash) || null;
  }

  async getDocumentStats(documentId: string): Promise<{
    totalVersions: number;
    averageTimeBetweenVersions: number;
    mostFrequentChangeType: string;
    uniqueContributors: string[];
    totalSizeBytes: number;
  } | null> {
    const versionedDoc = this.versionStore.get(documentId);
    if (!versionedDoc) {
      return null;
    }

    const versions = versionedDoc.versions;
    if (versions.length === 0) {
      return null;
    }

    // Calculate average time between versions
    let totalTimeDiff = 0;
    for (let i = 1; i < versions.length; i++) {
      totalTimeDiff += versions[i].timestamp.getTime() - versions[i - 1].timestamp.getTime();
    }
    const averageTimeBetweenVersions = versions.length > 1 ? totalTimeDiff / (versions.length - 1) : 0;

    // Find most frequent change type
    const changeTypeCounts = new Map<string, number>();
    const contributors = new Set<string>();

    let totalSize = 0;
    for (const version of versions) {
      const changeType = version.metadata.changeType;
      changeTypeCounts.set(changeType, (changeTypeCounts.get(changeType) || 0) + 1);

      if (version.metadata.createdBy) {
        contributors.add(version.metadata.createdBy);
      }

      totalSize += Buffer.byteLength(version.document.pageContent, 'utf8');
    }

    const mostFrequentChangeType = Array.from(changeTypeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    return {
      totalVersions: versions.length,
      averageTimeBetweenVersions,
      mostFrequentChangeType,
      uniqueContributors: Array.from(contributors),
      totalSizeBytes: totalSize,
    };
  }

  private generateDocumentHash(document: Document): string {
    const content = document.pageContent;
    const metadataStr = JSON.stringify(this.sortObjectKeys(document.metadata || {}));
    const combined = `${content}::${metadataStr}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  private getOrCreateDocumentId(document: Document, hash: string): string {
    // Try to find existing document by hash
    const existingId = this.hashIndex.get(hash);
    if (existingId) {
      return existingId;
    }

    // Try to use provided ID from metadata
    if (document.metadata?.documentId && typeof document.metadata.documentId === 'string') {
      return document.metadata.documentId;
    }

    // Generate new ID
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateVersionId(
    documentId: string,
    versionNumber: number,
    strategy: 'timestamp' | 'hash' | 'incremental',
    hash: string,
    timestamp: Date,
  ): string {
    switch (strategy) {
      case 'hash':
        return `${documentId}_v${versionNumber}_${hash.substring(0, 8)}`;
      case 'incremental':
        return `${documentId}_v${versionNumber}`;
      default:
        return `${documentId}_v${versionNumber}_${timestamp.getTime()}`;
    }
  }

  private isDuplicateVersion(versionedDoc: VersionedDocument, hash: string): boolean {
    return versionedDoc.currentVersion.hash === hash;
  }

  private cloneDocument(document: Document): Document {
    return new Document({
      pageContent: document.pageContent,
      metadata: { ...document.metadata },
    });
  }

  private storeVersion(documentId: string, version: DocumentVersion, config: DocumentVersioningConfig): void {
    let versionedDoc = this.versionStore.get(documentId);

    if (!versionedDoc) {
      versionedDoc = {
        documentId,
        currentVersion: version,
        versions: [version],
        metadata: {
          totalVersions: 1,
          firstVersion: version.timestamp,
          lastModified: version.timestamp,
          documentType: version.document.metadata?.type,
          tags: version.document.metadata?.tags,
        },
      };
    } else {
      versionedDoc.currentVersion = version;
      versionedDoc.versions.push(version);
      versionedDoc.metadata.totalVersions = versionedDoc.versions.length;
      versionedDoc.metadata.lastModified = version.timestamp;

      // Apply max versions limit if configured
      if (config.maxVersions && versionedDoc.versions.length > config.maxVersions) {
        const toRemove = versionedDoc.versions.length - config.maxVersions;
        versionedDoc.versions.splice(0, toRemove);
      }
    }

    this.versionStore.set(documentId, versionedDoc);
  }

  private compareContent(contentA: string, contentB: string): { added: string[]; removed: string[]; modified: string[] } {
    const linesA = contentA.split('\n');
    const linesB = contentB.split('\n');

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    const setA = new Set(linesA);
    const setB = new Set(linesB);

    for (const line of linesB) {
      if (!setA.has(line)) {
        added.push(line);
      }
    }

    for (const line of linesA) {
      if (!setB.has(line)) {
        removed.push(line);
      }
    }

    // Simple modified detection (lines that exist in both but at different positions)
    for (let i = 0; i < Math.min(linesA.length, linesB.length); i++) {
      if (linesA[i] !== linesB[i] && setA.has(linesB[i]) && setB.has(linesA[i])) {
        modified.push(`Line ${i + 1}`);
      }
    }

    return { added, removed, modified };
  }

  private compareMetadata(
    metadataA: any,
    metadataB: any,
  ): {
    added: Record<string, any>;
    removed: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
  } {
    const added: Record<string, any> = {};
    const removed: Record<string, any> = {};
    const modified: Record<string, { old: any; new: any }> = {};

    const keysA = new Set(Object.keys(metadataA || {}));
    const keysB = new Set(Object.keys(metadataB || {}));

    for (const key of keysB) {
      if (!keysA.has(key)) {
        added[key] = metadataB[key];
      } else if (JSON.stringify(metadataA[key]) !== JSON.stringify(metadataB[key])) {
        modified[key] = { old: metadataA[key], new: metadataB[key] };
      }
    }

    for (const key of keysA) {
      if (!keysB.has(key)) {
        removed[key] = metadataA[key];
      }
    }

    return { added, removed, modified };
  }

  private calculateSimilarity(contentA: string, contentB: string): number {
    if (contentA === contentB) {
      return 1.0;
    }

    const longer = contentA.length > contentB.length ? contentA : contentB;
    const shorter = contentA.length > contentB.length ? contentB : contentA;

    if (longer.length === 0) {
      return 1.0;
    }

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
        }
      }
    }

    return dp[m][n];
  }

  private sortObjectKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }

    return Object.keys(obj)
      .sort()
      .reduce((sorted: any, key) => {
        sorted[key] = this.sortObjectKeys(obj[key]);
        return sorted;
      }, {});
  }
}
