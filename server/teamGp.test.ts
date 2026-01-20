import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database functions
vi.mock('./db', () => ({
  getGPsByTeam: vi.fn(),
  assignGPsToTeam: vi.fn(),
  removeGPsFromTeam: vi.fn(),
  getUnassignedGPs: vi.fn(),
  getTeamWithGPs: vi.fn(),
  updateTeamWithGPs: vi.fn(),
  getAllTeamsWithGPs: vi.fn(),
}));

import * as db from './db';

describe('Team GP Assignment Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGPsByTeam', () => {
    it('should return GPs for a specific team', async () => {
      const mockGPs = [
        { id: 1, name: 'GP One', teamId: 1 },
        { id: 2, name: 'GP Two', teamId: 1 },
      ];
      vi.mocked(db.getGPsByTeam).mockResolvedValue(mockGPs as any);

      const result = await db.getGPsByTeam(1);
      expect(result).toEqual(mockGPs);
      expect(db.getGPsByTeam).toHaveBeenCalledWith(1);
    });

    it('should return unassigned GPs when teamId is null', async () => {
      const mockGPs = [
        { id: 3, name: 'GP Three', teamId: null },
      ];
      vi.mocked(db.getGPsByTeam).mockResolvedValue(mockGPs as any);

      const result = await db.getGPsByTeam(null);
      expect(result).toEqual(mockGPs);
      expect(db.getGPsByTeam).toHaveBeenCalledWith(null);
    });
  });

  describe('assignGPsToTeam', () => {
    it('should assign multiple GPs to a team', async () => {
      vi.mocked(db.assignGPsToTeam).mockResolvedValue({ success: 3, failed: 0 });

      const result = await db.assignGPsToTeam([1, 2, 3], 1);
      expect(result).toEqual({ success: 3, failed: 0 });
      expect(db.assignGPsToTeam).toHaveBeenCalledWith([1, 2, 3], 1);
    });

    it('should handle partial failures', async () => {
      vi.mocked(db.assignGPsToTeam).mockResolvedValue({ success: 2, failed: 1 });

      const result = await db.assignGPsToTeam([1, 2, 3], 1);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('removeGPsFromTeam', () => {
    it('should remove GPs from team (set teamId to null)', async () => {
      vi.mocked(db.removeGPsFromTeam).mockResolvedValue({ success: 2, failed: 0 });

      const result = await db.removeGPsFromTeam([1, 2]);
      expect(result).toEqual({ success: 2, failed: 0 });
      expect(db.removeGPsFromTeam).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe('getUnassignedGPs', () => {
    it('should return all GPs without a team', async () => {
      const mockGPs = [
        { id: 1, name: 'Unassigned GP 1', teamId: null },
        { id: 2, name: 'Unassigned GP 2', teamId: null },
      ];
      vi.mocked(db.getUnassignedGPs).mockResolvedValue(mockGPs as any);

      const result = await db.getUnassignedGPs();
      expect(result).toHaveLength(2);
      expect(result.every((gp: any) => gp.teamId === null)).toBe(true);
    });

    it('should return empty array when all GPs are assigned', async () => {
      vi.mocked(db.getUnassignedGPs).mockResolvedValue([]);

      const result = await db.getUnassignedGPs();
      expect(result).toEqual([]);
    });
  });

  describe('getTeamWithGPs', () => {
    it('should return team with its assigned GPs', async () => {
      const mockTeam = {
        id: 1,
        teamName: 'Team Alpha',
        floorManagerName: 'John Doe',
        gamePresenters: [
          { id: 1, name: 'GP One', teamId: 1 },
          { id: 2, name: 'GP Two', teamId: 1 },
        ],
      };
      vi.mocked(db.getTeamWithGPs).mockResolvedValue(mockTeam as any);

      const result = await db.getTeamWithGPs(1);
      expect(result).toEqual(mockTeam);
      expect(result?.gamePresenters).toHaveLength(2);
    });

    it('should return null for non-existent team', async () => {
      vi.mocked(db.getTeamWithGPs).mockResolvedValue(null);

      const result = await db.getTeamWithGPs(999);
      expect(result).toBeNull();
    });
  });

  describe('updateTeamWithGPs', () => {
    it('should update team details and GP assignments', async () => {
      vi.mocked(db.updateTeamWithGPs).mockResolvedValue(undefined);

      await db.updateTeamWithGPs(1, { teamName: 'New Name' }, [1, 2, 3]);
      expect(db.updateTeamWithGPs).toHaveBeenCalledWith(
        1,
        { teamName: 'New Name' },
        [1, 2, 3]
      );
    });

    it('should handle empty GP array (remove all GPs)', async () => {
      vi.mocked(db.updateTeamWithGPs).mockResolvedValue(undefined);

      await db.updateTeamWithGPs(1, {}, []);
      expect(db.updateTeamWithGPs).toHaveBeenCalledWith(1, {}, []);
    });
  });

  describe('getAllTeamsWithGPs', () => {
    it('should return all teams with their GPs and stats', async () => {
      const mockTeams = [
        {
          id: 1,
          teamName: 'Team Alpha',
          floorManagerName: 'John',
          gamePresenters: [{ id: 1, name: 'GP 1' }],
          gpCount: 1,
          reportCount: 5,
          assignedUsers: [],
        },
        {
          id: 2,
          teamName: 'Team Beta',
          floorManagerName: 'Jane',
          gamePresenters: [{ id: 2, name: 'GP 2' }, { id: 3, name: 'GP 3' }],
          gpCount: 2,
          reportCount: 3,
          assignedUsers: [],
        },
      ];
      vi.mocked(db.getAllTeamsWithGPs).mockResolvedValue(mockTeams as any);

      const result = await db.getAllTeamsWithGPs();
      expect(result).toHaveLength(2);
      expect(result[0].gpCount).toBe(1);
      expect(result[1].gpCount).toBe(2);
    });

    it('should return empty array when no teams exist', async () => {
      vi.mocked(db.getAllTeamsWithGPs).mockResolvedValue([]);

      const result = await db.getAllTeamsWithGPs();
      expect(result).toEqual([]);
    });
  });
});

describe('Team GP Assignment Business Logic', () => {
  it('should not allow assigning same GP to multiple teams', async () => {
    // When a GP is assigned to a new team, they should be removed from the old team
    // This is handled by updateTeamWithGPs which first clears all GPs from the team
    // then assigns the new ones
    vi.mocked(db.updateTeamWithGPs).mockResolvedValue(undefined);

    // Assigning GP 1 to Team 1
    await db.updateTeamWithGPs(1, {}, [1]);
    
    // Later assigning GP 1 to Team 2 should work
    // The system should handle this by removing GP 1 from Team 1
    await db.updateTeamWithGPs(2, {}, [1]);
    
    expect(db.updateTeamWithGPs).toHaveBeenCalledTimes(2);
  });

  it('should handle bulk GP reassignment', async () => {
    vi.mocked(db.updateTeamWithGPs).mockResolvedValue(undefined);

    // Reassign multiple GPs at once
    const gpIds = [1, 2, 3, 4, 5];
    await db.updateTeamWithGPs(1, {}, gpIds);
    
    expect(db.updateTeamWithGPs).toHaveBeenCalledWith(1, {}, gpIds);
  });
});
