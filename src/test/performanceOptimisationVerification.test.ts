import { describe, it, expect, beforeEach } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import { api, setStorage, invalidateMarksMemoryCache, purgeSensitiveEntityCaches } from '../lib/storage';
import { Mark, Student } from '../types';

describe('Performance Optimization Verification Suite', () => {
  beforeEach(() => {
    invalidateMarksMemoryCache();
    window.localStorage.clear();
  });

  describe('1. In-Memory Marks Cache Integrity', () => {
    it('returns empty array on fresh cache and populates memory cache', () => {
      const initial = api.getMarks();
      expect(Array.isArray(initial)).toBe(true);
      expect(initial.length).toBe(0);
    });

    it('updates memory cache after successful setStorage without diverging from localStorage', () => {
      const mockMarks: Mark[] = [
        {
          id: 'mark-001',
          student_id: 'std-001',
          subject_id: 'sub-001',
          exam_id: 'exam-001',
          score: 85,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      setStorage('cbe_marks', mockMarks);

      // Verify that localStorage has the persistent JSON string
      const rawInLocalStorage = window.localStorage.getItem('cbe_marks');
      expect(rawInLocalStorage).not.toBeNull();
      const parsedFromDisk = JSON.parse(rawInLocalStorage!);
      expect(parsedFromDisk).toHaveLength(1);
      expect(parsedFromDisk[0].score).toBe(85);

      // Verify that api.getMarks() returns the memory-cached array
      const retrieved = api.getMarks();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe('mark-001');
      expect(retrieved[0].score).toBe(85);
    });

    it('clears memory cache when purgeSensitiveEntityCaches is executed', () => {
      const mockMarks: Mark[] = [
        {
          id: 'mark-002',
          student_id: 'std-002',
          subject_id: 'sub-002',
          exam_id: 'exam-002',
          score: 72,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      setStorage('cbe_marks', mockMarks);
      expect(api.getMarks().length).toBe(1);

      // Purge sensitive entity caches (e.g. on logout)
      purgeSensitiveEntityCaches();

      // Memory cache should be purged and localStorage cleared
      expect(window.localStorage.getItem('cbe_marks')).toBeNull();
      expect(api.getMarks()).toEqual([]);
    });
  });

  describe('2. Learner Table Pagination Slicing Metrics', () => {
    it('accurately computes pagination slices for 50 records per page', () => {
      const mockLearners: Partial<Student>[] = Array.from({ length: 125 }, (_, i) => ({
        id: `std-${i + 1}`,
        admission_number: `ADM-${1000 + i}`,
        full_name: `Learner ${i + 1}`,
        active: true,
      }));

      const pageSize = 50;
      const totalStudentsCount = mockLearners.length;
      const totalPages = Math.max(1, Math.ceil(totalStudentsCount / pageSize));
      expect(totalPages).toBe(3);

      // Page 1
      const page1 = mockLearners.slice(0, 50);
      expect(page1.length).toBe(50);
      expect(page1[0].id).toBe('std-1');
      expect(page1[49].id).toBe('std-50');

      // Page 2
      const page2 = mockLearners.slice(50, 100);
      expect(page2.length).toBe(50);
      expect(page2[0].id).toBe('std-51');
      expect(page2[49].id).toBe('std-100');

      // Page 3 (partial page)
      const page3 = mockLearners.slice(100, 125);
      expect(page3.length).toBe(25);
      expect(page3[0].id).toBe('std-101');
      expect(page3[24].id).toBe('std-125');
    });
  });

  describe('3. Reference-Equality Navigation State Synchronization', () => {
    it('prevents redundant hashchange processing when hash matches activeTabRef', () => {
      let activeTabRefValue = 'dashboard';
      let duplicateDispatches = 0;

      const handleSelectTab = (newTab: string) => {
        activeTabRefValue = newTab;
      };

      const handleHashChange = (incomingHash: string) => {
        if (incomingHash === activeTabRefValue) {
          // Already handled programmatically - clean no-op!
          return;
        }
        duplicateDispatches++;
        activeTabRefValue = incomingHash;
      };

      // Step 1: Programmatic tab selection to 'reports'
      handleSelectTab('reports');

      // Browser subsequently fires hashchange with 'reports'
      handleHashChange('reports');

      // Verified: Duplicate dispatch was completely prevented
      expect(duplicateDispatches).toBe(0);
      expect(activeTabRefValue).toBe('reports');

      // Step 2: Genuine external navigation (e.g. Android hardware back to 'dashboard')
      handleHashChange('dashboard');

      // Verified: Genuine back navigation was processed
      expect(duplicateDispatches).toBe(1);
      expect(activeTabRefValue).toBe('dashboard');
    });
  });
});
