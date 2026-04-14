import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => ({
  getErrorCountByGP: vi.fn(),
  updateGPMistakesDirectly: vi.fn(),
  getAllErrorFiles: vi.fn(),
  getErrorFilesByUser: vi.fn(),
}));

describe('Error Count Fix - Architecture Verification', () => {
  
  describe('getErrorCountByGP reads from monthlyGpStats', () => {
    it('should NOT use COUNT(gpErrors) - verify source code', async () => {
      const fs = await import('fs');
      
      // Check db.ts
      const dbSource = fs.readFileSync('./server/db.ts', 'utf-8');
      const dbFnMatch = dbSource.match(/export async function getErrorCountByGP[\s\S]*?^}/m);
      expect(dbFnMatch).toBeTruthy();
      const dbFnBody = dbFnMatch![0];
      
      // Should NOT contain COUNT(gpErrors)
      expect(dbFnBody).not.toContain('COUNT(${gpErrors.id})');
      expect(dbFnBody).not.toContain('COUNT(${gpErrors');
      
      // Should contain monthlyGpStats.mistakes
      expect(dbFnBody).toContain('monthlyGpStats.mistakes');
      expect(dbFnBody).toContain('monthlyGpStats');
      expect(dbFnBody).toContain('gamePresenters');
    });

    it('should NOT use COUNT(gpErrors) in db/errors.ts', async () => {
      const fs = await import('fs');
      
      const errorsSource = fs.readFileSync('./server/db/errors.ts', 'utf-8');
      const fnMatch = errorsSource.match(/export async function getErrorCountByGP[\s\S]*?^}/m);
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      
      // Should NOT contain COUNT(gpErrors)
      expect(fnBody).not.toContain('COUNT(${gpErrors.id})');
      expect(fnBody).not.toContain('COUNT(${gpErrors');
      
      // Should contain monthlyGpStats.mistakes
      expect(fnBody).toContain('monthlyGpStats.mistakes');
    });
  });

  describe('Error Count Analysis sheet is primary source', () => {
    it('upload mutation should use Error Count Analysis sheet column E', async () => {
      const fs = await import('fs');
      const routerSource = fs.readFileSync('./server/routers.ts', 'utf-8');
      
      // Verify the upload mutation uses "Error Count Analysis" as primary source
      expect(routerSource).toContain("Error Count Analysis");
      expect(routerSource).toContain("column E");
      expect(routerSource).toContain("excludes technical errors");
    });

    it('recalculate endpoint should exist and use Error Count Analysis', async () => {
      const fs = await import('fs');
      const routerSource = fs.readFileSync('./server/routers.ts', 'utf-8');
      
      // Verify recalculate endpoint exists
      expect(routerSource).toContain('recalculate: protectedProcedure');
      
      // Verify it re-parses Error Count Analysis sheet
      expect(routerSource).toContain("Error Count Analysis");
      expect(routerSource).toContain("getCell(5)"); // Column E
    });
  });

  describe('updateGPMistakesDirectly writes to monthlyGpStats', () => {
    it('should write to monthlyGpStats.mistakes', async () => {
      const fs = await import('fs');
      const errorsSource = fs.readFileSync('./server/db/errors.ts', 'utf-8');
      
      const fnMatch = errorsSource.match(/export async function updateGPMistakesDirectly[\s\S]*?^}/m);
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      
      // Should set mistakes in monthlyGpStats
      expect(fnBody).toContain('monthlyGpStats');
      expect(fnBody).toContain('mistakes: mistakesCount');
    });
  });

  describe('Dashboard uses monthlyGpStats for mistakes display', () => {
    it('getGpMonthlyHistory should read from monthlyGpStats', async () => {
      const fs = await import('fs');
      const statsSource = fs.readFileSync('./server/db/monthlyStats.ts', 'utf-8');
      
      const fnMatch = statsSource.match(/export async function getGpMonthlyHistory[\s\S]*?^}/m);
      expect(fnMatch).toBeTruthy();
      const fnBody = fnMatch![0];
      
      // Should read mistakes from stats (monthlyGpStats)
      expect(fnBody).toContain('stats?.mistakes');
      // Should NOT use gpErrors table
      expect(fnBody).not.toContain('gpErrors');
    });
  });
});
