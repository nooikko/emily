import { Injectable, Logger } from '@nestjs/common';
import type { StructuredToolInterface } from '@langchain/core/tools';
import * as semver from 'semver';
import type { ToolVersion, ToolMetadata, ToolRegistration } from '../interfaces/tool-registry.interface';

@Injectable()
export class ToolVersionService {
  private readonly logger = new Logger(ToolVersionService.name);
  private readonly versions = new Map<string, ToolVersion[]>();
  private readonly compatibilityMatrix = new Map<string, Map<string, boolean>>();

  /**
   * Add a new version of a tool
   */
  addVersion(toolName: string, version: ToolVersion): void {
    const versions = this.versions.get(toolName) || [];
    
    // Check if version already exists
    const existingIndex = versions.findIndex(v => v.version === version.version);
    if (existingIndex >= 0) {
      this.logger.warn(`Version ${version.version} of ${toolName} already exists. Updating.`);
      versions[existingIndex] = version;
    } else {
      versions.push(version);
      this.sortVersions(versions);
    }
    
    this.versions.set(toolName, versions);
    this.logger.log(`Added version ${version.version} of ${toolName}`);
  }

  /**
   * Get all versions of a tool
   */
  getVersions(toolName: string): ToolVersion[] {
    return this.versions.get(toolName) || [];
  }

  /**
   * Get a specific version of a tool
   */
  getVersion(toolName: string, version: string): ToolVersion | null {
    const versions = this.getVersions(toolName);
    return versions.find(v => v.version === version) || null;
  }

  /**
   * Get the latest version of a tool
   */
  getLatestVersion(toolName: string): ToolVersion | null {
    const versions = this.getVersions(toolName);
    if (versions.length === 0) {
      return null;
    }
    
    // Return the highest semantic version
    return versions[0]; // Already sorted in descending order
  }

  /**
   * Get versions that match a semver range
   */
  getVersionsInRange(toolName: string, range: string): ToolVersion[] {
    const versions = this.getVersions(toolName);
    return versions.filter(v => semver.satisfies(v.version, range));
  }

  /**
   * Check if two versions are compatible
   */
  areVersionsCompatible(toolName: string, version1: string, version2: string): boolean {
    // Check compatibility matrix first
    const key = `${toolName}:${version1}:${version2}`;
    const reverseKey = `${toolName}:${version2}:${version1}`;
    
    if (this.compatibilityMatrix.has(key)) {
      return this.compatibilityMatrix.get(key)!.get(key) || false;
    }
    if (this.compatibilityMatrix.has(reverseKey)) {
      return this.compatibilityMatrix.get(reverseKey)!.get(reverseKey) || false;
    }
    
    // Default compatibility check using semver
    // Versions are compatible if they have the same major version
    const major1 = semver.major(version1);
    const major2 = semver.major(version2);
    
    return major1 === major2;
  }

  /**
   * Set compatibility between versions
   */
  setCompatibility(toolName: string, version1: string, version2: string, compatible: boolean): void {
    const key = `${toolName}:${version1}:${version2}`;
    
    if (!this.compatibilityMatrix.has(key)) {
      this.compatibilityMatrix.set(key, new Map());
    }
    
    this.compatibilityMatrix.get(key)!.set(key, compatible);
  }

  /**
   * Migrate from one version to another
   */
  async migrateVersion(
    toolName: string,
    fromVersion: string,
    toVersion: string,
    data?: any
  ): Promise<{ success: boolean; migratedData?: any; error?: string }> {
    const fromTool = this.getVersion(toolName, fromVersion);
    const toTool = this.getVersion(toolName, toVersion);
    
    if (!fromTool || !toTool) {
      return {
        success: false,
        error: 'Version not found',
      };
    }
    
    // Check if versions are compatible
    if (!this.areVersionsCompatible(toolName, fromVersion, toVersion)) {
      this.logger.warn(`Versions ${fromVersion} and ${toVersion} of ${toolName} are not compatible`);
    }
    
    // Perform migration (this would be customized per tool)
    try {
      // Example migration logic
      const migratedData = await this.performMigration(fromTool, toTool, data);
      
      return {
        success: true,
        migratedData,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
      };
    }
  }

  /**
   * Remove a version
   */
  removeVersion(toolName: string, version: string): boolean {
    const versions = this.getVersions(toolName);
    const index = versions.findIndex(v => v.version === version);
    
    if (index >= 0) {
      versions.splice(index, 1);
      
      if (versions.length === 0) {
        this.versions.delete(toolName);
      } else {
        this.versions.set(toolName, versions);
      }
      
      this.logger.log(`Removed version ${version} of ${toolName}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get version changelog
   */
  getChangelog(toolName: string, fromVersion?: string, toVersion?: string): string[] {
    const versions = this.getVersions(toolName);
    const changelogs: string[] = [];
    
    for (const version of versions) {
      if (fromVersion && semver.lt(version.version, fromVersion)) {
        continue;
      }
      if (toVersion && semver.gt(version.version, toVersion)) {
        continue;
      }
      
      if (version.changelog) {
        changelogs.push(`v${version.version}: ${version.changelog}`);
      }
    }
    
    return changelogs;
  }

  /**
   * Check if a version is deprecated
   */
  isVersionDeprecated(toolName: string, version: string): boolean {
    const tool = this.getVersion(toolName, version);
    return tool?.metadata.deprecated || false;
  }

  /**
   * Get recommended version for upgrade
   */
  getRecommendedUpgrade(toolName: string, currentVersion: string): ToolVersion | null {
    const versions = this.getVersions(toolName);
    
    // Find the latest non-deprecated version that is compatible
    for (const version of versions) {
      if (
        semver.gt(version.version, currentVersion) &&
        !version.metadata.deprecated &&
        this.areVersionsCompatible(toolName, currentVersion, version.version)
      ) {
        return version;
      }
    }
    
    return null;
  }

  /**
   * Sort versions in descending order
   */
  private sortVersions(versions: ToolVersion[]): void {
    versions.sort((a, b) => semver.rcompare(a.version, b.version));
  }

  /**
   * Perform actual migration (to be implemented per tool)
   */
  private async performMigration(
    fromTool: ToolVersion,
    toTool: ToolVersion,
    data?: any
  ): Promise<any> {
    // This would contain actual migration logic
    // For now, just return the data as-is
    this.logger.log(`Migrating from ${fromTool.version} to ${toTool.version}`);
    return data;
  }

  /**
   * Export version history
   */
  exportVersionHistory(toolName: string): object {
    const versions = this.getVersions(toolName);
    
    return {
      tool: toolName,
      versions: versions.map(v => ({
        version: v.version,
        createdAt: v.createdAt,
        deprecated: v.metadata.deprecated || false,
        changelog: v.changelog,
        compatible: v.compatible,
      })),
      latest: this.getLatestVersion(toolName)?.version,
      total: versions.length,
    };
  }
}