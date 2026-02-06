import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', async () => {
  const actual = await vi.importActual('./db') as any;
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

describe('GP Monthly History', () => {
  describe('getGpMonthlyHistory', () => {
    it('should return an array of monthly data', async () => {
      const { getGpMonthlyHistory } = await import('./db');
      
      // Call with a GP ID that likely doesn't exist in test env
      const result = await getGpMonthlyHistory(99999, 6);
      
      // Should return an array
      expect(Array.isArray(result)).toBe(true);
      // Should have 6 months of data
      expect(result.length).toBe(6);
      
      // Each month should have the expected structure
      for (const month of result) {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('year');
        expect(month).toHaveProperty('label');
        expect(month).toHaveProperty('avgTotal');
        expect(month).toHaveProperty('avgAppearance');
        expect(month).toHaveProperty('avgPerformance');
        expect(month).toHaveProperty('evalCount');
        expect(month).toHaveProperty('highScore');
        expect(month).toHaveProperty('lowScore');
        
        // Month should be 1-12
        expect(month.month).toBeGreaterThanOrEqual(1);
        expect(month.month).toBeLessThanOrEqual(12);
        
        // Year should be reasonable
        expect(month.year).toBeGreaterThanOrEqual(2025);
        expect(month.year).toBeLessThanOrEqual(2027);
        
        // Label should be formatted like "Jan 2026"
        expect(month.label).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
        
        // Scores should be non-negative
        expect(month.avgTotal).toBeGreaterThanOrEqual(0);
        expect(month.avgAppearance).toBeGreaterThanOrEqual(0);
        expect(month.avgPerformance).toBeGreaterThanOrEqual(0);
        expect(month.evalCount).toBeGreaterThanOrEqual(0);
        expect(month.highScore).toBeGreaterThanOrEqual(0);
        expect(month.lowScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle non-existent GP gracefully', async () => {
      const { getGpMonthlyHistory } = await import('./db');
      
      // Use a GP ID that definitely doesn't exist
      const result = await getGpMonthlyHistory(-1, 6);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(6);
      
      // All months should have zero evaluations
      for (const month of result) {
        expect(month.evalCount).toBe(0);
        expect(month.avgTotal).toBe(0);
      }
    });

    it('should return correct number of months', async () => {
      const { getGpMonthlyHistory } = await import('./db');
      
      const result3 = await getGpMonthlyHistory(99999, 3);
      expect(result3.length).toBe(3);
      
      const result12 = await getGpMonthlyHistory(99999, 12);
      expect(result12.length).toBe(12);
    });

    it('should return months in chronological order (oldest first)', async () => {
      const { getGpMonthlyHistory } = await import('./db');
      
      const result = await getGpMonthlyHistory(99999, 6);
      
      // Verify chronological order
      for (let i = 1; i < result.length; i++) {
        const prevDate = new Date(result[i-1].year, result[i-1].month - 1);
        const currDate = new Date(result[i].year, result[i].month - 1);
        expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime());
      }
    });

    it('should have zero averages for months with no evaluations', async () => {
      const { getGpMonthlyHistory } = await import('./db');
      
      // Use a GP ID that doesn't exist - should have no evaluations
      const result = await getGpMonthlyHistory(99999, 6);
      
      for (const month of result) {
        expect(month.evalCount).toBe(0);
        expect(month.avgTotal).toBe(0);
        expect(month.avgAppearance).toBe(0);
        expect(month.avgPerformance).toBe(0);
      }
    });
  });

  describe('monthlyHistory in getEvaluationsByToken response', () => {
    it('should include monthlyHistory field in GP portal data', async () => {
      // This test verifies the router includes monthlyHistory
      // We check the router code structure
      const fs = await import('fs');
      const routerCode = fs.readFileSync('./server/routers.ts', 'utf-8');
      
      // Verify monthlyHistory is included in the response
      expect(routerCode).toContain('getGpMonthlyHistory');
      expect(routerCode).toContain('monthlyHistory');
    });
  });
});
