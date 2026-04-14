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
    it('upload mutation should use Error Count Analysis sheet column C for name, column E for count', async () => {
      const fs = await import('fs');
      const routerSource = fs.readFileSync('./server/routers.ts', 'utf-8');
      
      // Verify the upload mutation uses "Error Count Analysis" as primary source
      expect(routerSource).toContain("Error Count Analysis");
      expect(routerSource).toContain("column E");
      expect(routerSource).toContain("excludes technical errors");
      // Column C (cell 3) for GP name, NOT column B (cell 2)
      expect(routerSource).toContain('getCell(3)); // Column C - Employee Name');
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

  describe('Attendance page prioritizes monthlyStats.mistakes', () => {
    it('Attendance.tsx should use monthlyStats.mistakes first', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('./client/src/pages/Attendance.tsx', 'utf-8');
      
      // Should prioritize monthlyStats over attendance for mistakes
      expect(source).toContain('item.monthlyStats?.mistakes ?? item.attendance?.mistakes');
      // Should NOT have the wrong priority
      expect(source).not.toContain('item.attendance?.mistakes ?? item.monthlyStats?.mistakes');
    });

    it('teamSummary in routers.ts should use monthlyStats.mistakes first', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('./server/routers.ts', 'utf-8');
      
      // The teamSummary totals should prioritize monthlyStats.mistakes
      expect(source).toContain('item.monthlyStats?.mistakes ?? item.attendance?.mistakes');
    });

    it('attendance trends in db.ts should use monthlyGpStats as primary', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('./server/db.ts', 'utf-8');
      
      // Should contain the comment about using monthlyGpStats as primary
      expect(source).toContain('Use monthlyGpStats.mistakes as the primary source');
    });

    it('googleSheetsService should prioritize monthlyStats.mistakes', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('./server/services/googleSheetsService.ts', 'utf-8');
      
      // Should have monthlyStats first in the attendance totals
      expect(source).toContain('item.monthlyStats?.mistakes ?? item.attendance?.mistakes');
      expect(source).not.toContain('item.attendance?.mistakes ?? item.monthlyStats?.mistakes');
    });
  });
});
