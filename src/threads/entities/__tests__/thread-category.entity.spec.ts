import { ThreadCategory } from '../thread-category.entity';

describe('ThreadCategory Entity', () => {
  let category: ThreadCategory;

  beforeEach(() => {
    category = new ThreadCategory();
    category.id = '123e4567-e89b-12d3-a456-426614174000';
    category.name = 'Test Category';
    category.sortOrder = 0;
    category.isActive = true;
    category.isSystem = false;
    category.threadCount = 0;
    category.createdAt = new Date('2024-01-01T12:00:00Z');
    category.updatedAt = new Date('2024-01-01T12:00:00Z');
  });

  describe('Constructor and Properties', () => {
    it('should create a category with correct properties', () => {
      expect(category).toBeInstanceOf(ThreadCategory);
      expect(category.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(category.name).toBe('Test Category');
      expect(category.sortOrder).toBe(0);
      expect(category.isActive).toBe(true);
      expect(category.isSystem).toBe(false);
      expect(category.threadCount).toBe(0);
    });

    it('should handle optional properties', () => {
      const newCategory = new ThreadCategory();
      expect(newCategory.description).toBeUndefined();
      expect(newCategory.color).toBeUndefined();
      expect(newCategory.icon).toBeUndefined();
      expect(newCategory.createdBy).toBeUndefined();
      expect(newCategory.settings).toBeUndefined();
    });
  });

  describe('incrementThreadCount()', () => {
    it('should increment thread count by 1', () => {
      expect(category.threadCount).toBe(0);
      category.incrementThreadCount();
      expect(category.threadCount).toBe(1);
    });

    it('should increment from existing count', () => {
      category.threadCount = 5;
      category.incrementThreadCount();
      expect(category.threadCount).toBe(6);
    });
  });

  describe('decrementThreadCount()', () => {
    it('should decrement thread count by 1', () => {
      category.threadCount = 5;
      category.decrementThreadCount();
      expect(category.threadCount).toBe(4);
    });

    it('should not decrement below 0', () => {
      category.threadCount = 0;
      category.decrementThreadCount();
      expect(category.threadCount).toBe(0);
    });

    it('should handle multiple decrements correctly', () => {
      category.threadCount = 3;
      category.decrementThreadCount();
      category.decrementThreadCount();
      category.decrementThreadCount();
      category.decrementThreadCount(); // One extra
      expect(category.threadCount).toBe(0);
    });
  });

  describe('deactivate()', () => {
    it('should set isActive to false', () => {
      category.isActive = true;
      category.deactivate();
      expect(category.isActive).toBe(false);
    });

    it('should work when already inactive', () => {
      category.isActive = false;
      category.deactivate();
      expect(category.isActive).toBe(false);
    });
  });

  describe('activate()', () => {
    it('should set isActive to true', () => {
      category.isActive = false;
      category.activate();
      expect(category.isActive).toBe(true);
    });

    it('should work when already active', () => {
      category.isActive = true;
      category.activate();
      expect(category.isActive).toBe(true);
    });
  });

  describe('isSystemCategory()', () => {
    it('should return true for system categories', () => {
      category.isSystem = true;
      expect(category.isSystemCategory()).toBe(true);
    });

    it('should return false for non-system categories', () => {
      category.isSystem = false;
      expect(category.isSystemCategory()).toBe(false);
    });
  });

  describe('canEdit()', () => {
    it('should return false for system categories', () => {
      category.isSystem = true;
      expect(category.canEdit('user-123')).toBe(false);
      expect(category.canEdit()).toBe(false);
    });

    it('should return true for non-system categories with no creator restriction', () => {
      category.isSystem = false;
      category.createdBy = undefined;
      expect(category.canEdit('user-123')).toBe(true);
      expect(category.canEdit()).toBe(true);
    });

    it('should return true when userId matches creator', () => {
      category.isSystem = false;
      category.createdBy = 'user-123';
      expect(category.canEdit('user-123')).toBe(true);
    });

    it('should return false when userId does not match creator', () => {
      category.isSystem = false;
      category.createdBy = 'user-123';
      expect(category.canEdit('user-456')).toBe(false);
    });

    it('should return false when no userId provided and category has creator', () => {
      category.isSystem = false;
      category.createdBy = 'user-123';
      expect(category.canEdit()).toBe(false);
    });
  });

  describe('canDelete()', () => {
    it('should return false for system categories', () => {
      category.isSystem = true;
      category.threadCount = 0;
      expect(category.canDelete('user-123')).toBe(false);
    });

    it('should return false for categories with threads', () => {
      category.isSystem = false;
      category.threadCount = 5;
      category.createdBy = 'user-123';
      expect(category.canDelete('user-123')).toBe(false);
    });

    it('should return true for empty non-system categories by creator', () => {
      category.isSystem = false;
      category.threadCount = 0;
      category.createdBy = 'user-123';
      expect(category.canDelete('user-123')).toBe(true);
    });

    it('should return false for empty categories by non-creator', () => {
      category.isSystem = false;
      category.threadCount = 0;
      category.createdBy = 'user-123';
      expect(category.canDelete('user-456')).toBe(false);
    });

    it('should return true for empty categories with no creator restriction', () => {
      category.isSystem = false;
      category.threadCount = 0;
      category.createdBy = undefined;
      expect(category.canDelete('user-123')).toBe(true);
      expect(category.canDelete()).toBe(true);
    });
  });

  describe('toSafeObject()', () => {
    it('should return sanitized object with all properties', () => {
      category.description = 'Test description';
      category.color = '#FF0000';
      category.icon = 'folder';
      category.createdBy = 'user-123';
      category.settings = {
        autoArchiveAfterDays: 30,
        defaultPriority: 'normal',
        notificationsEnabled: true,
        tags: ['tag1', 'tag2'],
      };

      const safeObject = category.toSafeObject();

      expect(safeObject).toEqual({
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        isSystem: category.isSystem,
        createdBy: category.createdBy,
        threadCount: category.threadCount,
        settings: category.settings,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      });
    });

    it('should handle undefined optional properties', () => {
      const safeObject = category.toSafeObject();

      expect(safeObject).toHaveProperty('description', undefined);
      expect(safeObject).toHaveProperty('color', undefined);
      expect(safeObject).toHaveProperty('icon', undefined);
      expect(safeObject).toHaveProperty('createdBy', undefined);
      expect(safeObject).toHaveProperty('settings', undefined);
    });
  });

  describe('Settings Handling', () => {
    it('should handle comprehensive settings', () => {
      category.settings = {
        autoArchiveAfterDays: 90,
        defaultPriority: 'high',
        notificationsEnabled: false,
        tags: ['important', 'work'],
        customSetting: 'customValue',
      };

      expect(category.settings.autoArchiveAfterDays).toBe(90);
      expect(category.settings.defaultPriority).toBe('high');
      expect(category.settings.notificationsEnabled).toBe(false);
      expect(category.settings.tags).toEqual(['important', 'work']);
      expect(category.settings.customSetting).toBe('customValue');
    });

    it('should allow partial settings', () => {
      category.settings = {
        defaultPriority: 'urgent',
      };

      expect(category.settings.defaultPriority).toBe('urgent');
      expect(category.settings.autoArchiveAfterDays).toBeUndefined();
    });

    it('should handle empty settings object', () => {
      category.settings = {};
      expect(category.settings).toEqual({});
    });
  });

  describe('getDefaultCategories()', () => {
    it('should return array of default categories', () => {
      const defaults = ThreadCategory.getDefaultCategories();

      expect(Array.isArray(defaults)).toBe(true);
      expect(defaults.length).toBeGreaterThan(0);
    });

    it('should include General category', () => {
      const defaults = ThreadCategory.getDefaultCategories();
      const general = defaults.find((cat) => cat.name === 'General');

      expect(general).toBeDefined();
      expect(general!.name).toBe('General');
      expect(general!.isSystem).toBe(true);
      expect(general!.isActive).toBe(true);
      expect(general!.color).toBe('#6B7280');
      expect(general!.icon).toBe('chat');
      expect(general!.sortOrder).toBe(0);
    });

    it('should include Work category', () => {
      const defaults = ThreadCategory.getDefaultCategories();
      const work = defaults.find((cat) => cat.name === 'Work');

      expect(work).toBeDefined();
      expect(work!.name).toBe('Work');
      expect(work!.isSystem).toBe(true);
      expect(work!.color).toBe('#3B82F6');
      expect(work!.icon).toBe('briefcase');
    });

    it('should include Learning category', () => {
      const defaults = ThreadCategory.getDefaultCategories();
      const learning = defaults.find((cat) => cat.name === 'Learning');

      expect(learning).toBeDefined();
      expect(learning!.name).toBe('Learning');
      expect(learning!.color).toBe('#10B981');
      expect(learning!.icon).toBe('academic-cap');
    });

    it('should include Personal category', () => {
      const defaults = ThreadCategory.getDefaultCategories();
      const personal = defaults.find((cat) => cat.name === 'Personal');

      expect(personal).toBeDefined();
      expect(personal!.name).toBe('Personal');
      expect(personal!.color).toBe('#F59E0B');
      expect(personal!.icon).toBe('user');
    });

    it('should include Projects category', () => {
      const defaults = ThreadCategory.getDefaultCategories();
      const projects = defaults.find((cat) => cat.name === 'Projects');

      expect(projects).toBeDefined();
      expect(projects!.name).toBe('Projects');
      expect(projects!.color).toBe('#8B5CF6');
      expect(projects!.icon).toBe('code');
    });

    it('should have all categories as system categories', () => {
      const defaults = ThreadCategory.getDefaultCategories();

      defaults.forEach((category) => {
        expect(category.isSystem).toBe(true);
        expect(category.isActive).toBe(true);
      });
    });

    it('should have proper sort order', () => {
      const defaults = ThreadCategory.getDefaultCategories();

      for (let i = 0; i < defaults.length; i++) {
        expect(defaults[i].sortOrder).toBe(i);
      }
    });

    it('should return immutable default data', () => {
      const defaults1 = ThreadCategory.getDefaultCategories();
      const defaults2 = ThreadCategory.getDefaultCategories();

      // Should be different instances
      expect(defaults1).not.toBe(defaults2);

      // But same content
      expect(defaults1).toEqual(defaults2);
    });
  });

  describe('Color Validation', () => {
    it('should handle valid hex colors', () => {
      category.color = '#FF0000';
      expect(category.color).toBe('#FF0000');

      category.color = '#000000';
      expect(category.color).toBe('#000000');

      category.color = '#FFFFFF';
      expect(category.color).toBe('#FFFFFF');
    });

    it('should handle lowercase hex colors', () => {
      category.color = '#ff0000';
      expect(category.color).toBe('#ff0000');
    });

    it('should handle mixed case hex colors', () => {
      category.color = '#fF0000';
      expect(category.color).toBe('#fF0000');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large thread counts', () => {
      category.threadCount = Number.MAX_SAFE_INTEGER;
      category.incrementThreadCount();
      expect(category.threadCount).toBe(Number.MAX_SAFE_INTEGER + 1);
    });

    it('should handle negative thread counts from external sources', () => {
      category.threadCount = -5;
      category.decrementThreadCount();
      expect(category.threadCount).toBe(-5); // Should not decrement further
    });

    it('should handle very long names', () => {
      const longName = 'a'.repeat(200);
      category.name = longName;
      expect(category.name).toBe(longName);

      const safeObject = category.toSafeObject();
      expect(safeObject.name).toBe(longName);
    });

    it('should handle special characters in names', () => {
      category.name = 'Test & Category 🎉 with émojis';
      expect(category.name).toBe('Test & Category 🎉 with émojis');
    });

    it('should handle complex settings objects', () => {
      category.settings = {
        nested: {
          deeply: {
            nested: 'value',
          },
        },
        array: [1, 2, 3, { key: 'value' }],
        null: null,
        undefined: undefined,
        boolean: true,
        number: 42,
      };

      const safeObject = category.toSafeObject();
      expect(safeObject.settings).toEqual(category.settings);
    });

    it('should maintain consistency in permission checks', () => {
      // System category
      category.isSystem = true;
      category.threadCount = 0;
      category.createdBy = 'user-123';

      expect(category.canEdit('user-123')).toBe(false);
      expect(category.canDelete('user-123')).toBe(false);

      // Non-system category with threads
      category.isSystem = false;
      category.threadCount = 5;

      expect(category.canEdit('user-123')).toBe(true);
      expect(category.canDelete('user-123')).toBe(false);

      // Non-system category without threads
      category.threadCount = 0;

      expect(category.canEdit('user-123')).toBe(true);
      expect(category.canDelete('user-123')).toBe(true);
    });

    it('should handle activation/deactivation state changes', () => {
      expect(category.isActive).toBe(true);

      category.deactivate();
      expect(category.isActive).toBe(false);

      category.activate();
      expect(category.isActive).toBe(true);

      // Multiple calls should be idempotent
      category.activate();
      category.activate();
      expect(category.isActive).toBe(true);

      category.deactivate();
      category.deactivate();
      expect(category.isActive).toBe(false);
    });
  });
});
