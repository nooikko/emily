import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { ToolExecutionContext, ToolPermission } from '../interfaces/tool-registry.interface';

export interface PermissionCheck {
  tool: string;
  action: string;
  userId?: string;
  role?: string;
  context?: ToolExecutionContext;
}

export interface PermissionRule {
  id: string;
  name: string;
  description?: string;
  condition: (check: PermissionCheck) => boolean | Promise<boolean>;
  priority?: number;
}

@Injectable()
export class ToolPermissionService {
  private readonly logger = new Logger(ToolPermissionService.name);
  private readonly permissions = new Map<string, ToolPermission[]>();
  private readonly rules = new Map<string, PermissionRule>();
  private readonly roleHierarchy = new Map<string, number>();
  private readonly userRoles = new Map<string, Set<string>>();

  constructor() {
    // Initialize default role hierarchy
    this.initializeRoleHierarchy();
  }

  /**
   * Initialize default role hierarchy
   */
  private initializeRoleHierarchy(): void {
    this.roleHierarchy.set('admin', 100);
    this.roleHierarchy.set('developer', 80);
    this.roleHierarchy.set('operator', 60);
    this.roleHierarchy.set('user', 40);
    this.roleHierarchy.set('guest', 20);
    this.roleHierarchy.set('anonymous', 10);
  }

  /**
   * Set permissions for a tool
   */
  setToolPermissions(toolName: string, permissions: ToolPermission[]): void {
    this.permissions.set(toolName, permissions);
    this.logger.log(`Set ${permissions.length} permissions for tool ${toolName}`);
  }

  /**
   * Get permissions for a tool
   */
  getToolPermissions(toolName: string): ToolPermission[] {
    return this.permissions.get(toolName) || [];
  }

  /**
   * Check if a user has permission to perform an action on a tool
   */
  async hasPermission(check: PermissionCheck): Promise<boolean> {
    const { tool, action, userId, role, context } = check;

    // Get tool permissions
    const toolPermissions = this.getToolPermissions(tool);

    // If no permissions defined, allow by default (open access)
    if (toolPermissions.length === 0) {
      this.logger.debug(`No permissions defined for ${tool}, allowing access`);
      return true;
    }

    // Check user roles
    const userRoles = this.getUserRoles(userId);
    const effectiveRole = role || this.getHighestRole(userRoles);

    // Check against tool permissions
    for (const permission of toolPermissions) {
      if (this.matchesPermission(permission, action, effectiveRole)) {
        // Check additional restrictions
        if (permission.restrictions) {
          const restrictionsPassed = await this.checkRestrictions(permission.restrictions, check);
          if (!restrictionsPassed) {
            this.logger.debug(`Restrictions not met for ${tool}.${action}`);
            continue;
          }
        }

        this.logger.debug(`Permission granted for ${tool}.${action} to role ${effectiveRole}`);
        return true;
      }
    }

    // Check custom rules
    const rulePassed = await this.checkCustomRules(check);
    if (rulePassed) {
      this.logger.debug(`Custom rule granted permission for ${tool}.${action}`);
      return true;
    }

    this.logger.warn(`Permission denied for ${tool}.${action} to ${userId || 'unknown'} with role ${effectiveRole}`);
    return false;
  }

  /**
   * Enforce permission check (throws exception if denied)
   */
  async enforcePermission(check: PermissionCheck): Promise<void> {
    const hasPermission = await this.hasPermission(check);

    if (!hasPermission) {
      throw new ForbiddenException(`Permission denied: ${check.action} on ${check.tool} for user ${check.userId || 'unknown'}`);
    }
  }

  /**
   * Add a custom permission rule
   */
  addRule(rule: PermissionRule): void {
    this.rules.set(rule.id, rule);
    this.logger.log(`Added permission rule: ${rule.name}`);
  }

  /**
   * Remove a custom permission rule
   */
  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.logger.log(`Removed permission rule: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * Assign roles to a user
   */
  assignUserRoles(userId: string, roles: string[]): void {
    const userRoles = this.userRoles.get(userId) || new Set<string>();
    roles.forEach((role) => userRoles.add(role));
    this.userRoles.set(userId, userRoles);
    this.logger.log(`Assigned roles ${roles.join(', ')} to user ${userId}`);
  }

  /**
   * Revoke roles from a user
   */
  revokeUserRoles(userId: string, roles: string[]): void {
    const userRoles = this.userRoles.get(userId);
    if (userRoles) {
      roles.forEach((role) => userRoles.delete(role));
      if (userRoles.size === 0) {
        this.userRoles.delete(userId);
      } else {
        this.userRoles.set(userId, userRoles);
      }
      this.logger.log(`Revoked roles ${roles.join(', ')} from user ${userId}`);
    }
  }

  /**
   * Get user roles
   */
  getUserRoles(userId?: string): Set<string> {
    if (!userId) {
      return new Set(['anonymous']);
    }

    const roles = this.userRoles.get(userId) || new Set<string>();
    if (roles.size === 0) {
      roles.add('user'); // Default role for authenticated users
    }

    return roles;
  }

  /**
   * Check if a role can perform an action
   */
  private matchesPermission(permission: ToolPermission, action: string, role: string): boolean {
    // Check if role matches
    if (permission.role !== role && permission.role !== '*') {
      // Check role hierarchy
      const permissionLevel = this.roleHierarchy.get(permission.role) || 0;
      const userLevel = this.roleHierarchy.get(role) || 0;

      if (userLevel < permissionLevel) {
        return false;
      }
    }

    // Check if action is allowed
    if (!permission.actions.includes(action) && !permission.actions.includes('*')) {
      return false;
    }

    return true;
  }

  /**
   * Check additional restrictions
   */
  private async checkRestrictions(restrictions: Record<string, any>, check: PermissionCheck): Promise<boolean> {
    // Example restrictions checking
    if (restrictions.timeWindow) {
      const now = new Date();
      const { start, end } = restrictions.timeWindow;

      if (start && new Date(start) > now) {
        return false;
      }
      if (end && new Date(end) < now) {
        return false;
      }
    }

    if (restrictions.ipWhitelist && check.context?.metadata?.ip) {
      const ip = check.context.metadata.ip;
      if (!restrictions.ipWhitelist.includes(ip)) {
        return false;
      }
    }

    if (restrictions.maxExecutions && check.context?.executionId) {
      // Would need to track executions per user/tool
      // This is a simplified example
      const executions = restrictions.currentExecutions || 0;
      if (executions >= restrictions.maxExecutions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check custom rules
   */
  private async checkCustomRules(check: PermissionCheck): Promise<boolean> {
    const sortedRules = Array.from(this.rules.values()).sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of sortedRules) {
      try {
        const result = await rule.condition(check);
        if (result) {
          this.logger.debug(`Rule ${rule.name} granted permission`);
          return true;
        }
      } catch (error) {
        this.logger.error(`Error in rule ${rule.name}:`, error);
      }
    }

    return false;
  }

  /**
   * Get the highest role from a set of roles
   */
  private getHighestRole(roles: Set<string>): string {
    let highestRole = 'anonymous';
    let highestLevel = this.roleHierarchy.get('anonymous') || 0;

    for (const role of roles) {
      const level = this.roleHierarchy.get(role) || 0;
      if (level > highestLevel) {
        highestLevel = level;
        highestRole = role;
      }
    }

    return highestRole;
  }

  /**
   * Export permission configuration
   */
  exportPermissions(): object {
    const permissions: Record<string, any> = {};

    for (const [tool, perms] of this.permissions) {
      permissions[tool] = perms;
    }

    return {
      permissions,
      roles: Array.from(this.roleHierarchy.entries()).map(([role, level]) => ({
        role,
        level,
      })),
      rules: Array.from(this.rules.values()).map((rule) => ({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
      })),
      userRoles: Array.from(this.userRoles.entries()).map(([user, roles]) => ({
        user,
        roles: Array.from(roles),
      })),
    };
  }

  /**
   * Import permission configuration
   */
  importPermissions(config: any): void {
    // Import tool permissions
    if (config.permissions) {
      for (const [tool, perms] of Object.entries(config.permissions)) {
        this.setToolPermissions(tool, perms as ToolPermission[]);
      }
    }

    // Import role hierarchy
    if (config.roles) {
      this.roleHierarchy.clear();
      for (const { role, level } of config.roles) {
        this.roleHierarchy.set(role, level);
      }
    }

    // Import user roles
    if (config.userRoles) {
      this.userRoles.clear();
      for (const { user, roles } of config.userRoles) {
        this.assignUserRoles(user, roles);
      }
    }

    this.logger.log('Imported permission configuration');
  }
}
