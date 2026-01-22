import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database functions
vi.mock('./db', () => ({
  getAllGamePresenters: vi.fn().mockResolvedValue([
    { id: 1, name: 'Agnes Suvorov', teamId: 1 },
    { id: 2, name: 'John Smith', teamId: 1 },
    { id: 3, name: 'Maria Garcia', teamId: 2 },
  ]),
  createErrorScreenshot: vi.fn().mockResolvedValue({ id: 1 }),
  createAttitudeScreenshot: vi.fn().mockResolvedValue({ id: 1 }),
  getErrorScreenshots: vi.fn().mockResolvedValue([]),
  getAttitudeScreenshots: vi.fn().mockResolvedValue([]),
  getErrorScreenshotsForGP: vi.fn().mockResolvedValue([]),
  getAttitudeScreenshotsForGP: vi.fn().mockResolvedValue([]),
  updateMonthlyGpStatsMistakes: vi.fn().mockResolvedValue(undefined),
  updateMonthlyGpStatsAttitude: vi.fn().mockResolvedValue(undefined),
}));

describe('Error Screenshot Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should match GP names case-insensitively', () => {
    const gpNames = ['Agnes Suvorov', 'John Smith', 'Maria Garcia'];
    const extractedName = 'agnes suvorov';
    
    const matched = gpNames.find(name => 
      name.toLowerCase() === extractedName.toLowerCase()
    );
    
    expect(matched).toBe('Agnes Suvorov');
  });

  it('should match GP names with partial match', () => {
    const gpNames = ['Agnes Suvorov', 'John Smith', 'Maria Garcia'];
    const extractedName = 'Agnes';
    
    const matched = gpNames.find(name => 
      name.toLowerCase().includes(extractedName.toLowerCase()) ||
      extractedName.toLowerCase().includes(name.toLowerCase())
    );
    
    expect(matched).toBe('Agnes Suvorov');
  });

  it('should classify error severity correctly', () => {
    const classifySeverity = (errorType: string): string => {
      const criticalErrors = ['dealing_error', 'game_rules_error'];
      const highErrors = ['procedure_error', 'communication_error'];
      const mediumErrors = ['appearance_error'];
      
      if (criticalErrors.includes(errorType)) return 'critical';
      if (highErrors.includes(errorType)) return 'high';
      if (mediumErrors.includes(errorType)) return 'medium';
      return 'low';
    };

    expect(classifySeverity('dealing_error')).toBe('critical');
    expect(classifySeverity('procedure_error')).toBe('high');
    expect(classifySeverity('appearance_error')).toBe('medium');
    expect(classifySeverity('technical_error')).toBe('low');
  });

  it('should validate error types', () => {
    const validErrorTypes = [
      'dealing_error',
      'procedure_error', 
      'game_rules_error',
      'communication_error',
      'appearance_error',
      'technical_error',
      'other'
    ];

    expect(validErrorTypes).toContain('dealing_error');
    expect(validErrorTypes).toContain('procedure_error');
    expect(validErrorTypes).not.toContain('invalid_type');
  });
});

describe('Attitude Screenshot Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should classify attitude category based on score', () => {
    const classifyAttitude = (score: number): string => {
      if (score >= 4) return 'positive';
      if (score >= 3) return 'neutral';
      return 'negative';
    };

    expect(classifyAttitude(5)).toBe('positive');
    expect(classifyAttitude(4)).toBe('positive');
    expect(classifyAttitude(3)).toBe('neutral');
    expect(classifyAttitude(2)).toBe('negative');
    expect(classifyAttitude(1)).toBe('negative');
  });

  it('should validate attitude score range', () => {
    const validateScore = (score: number): boolean => {
      return score >= 1 && score <= 5;
    };

    expect(validateScore(1)).toBe(true);
    expect(validateScore(5)).toBe(true);
    expect(validateScore(3)).toBe(true);
    expect(validateScore(0)).toBe(false);
    expect(validateScore(6)).toBe(false);
  });

  it('should calculate average attitude score', () => {
    const scores = [4, 5, 3, 4, 5];
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    expect(average).toBe(4.2);
  });
});

describe('GP Portal Error Details', () => {
  it('should format error type for display', () => {
    const formatErrorType = (type: string): string => {
      return type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    };

    expect(formatErrorType('dealing_error')).toBe('Dealing Error');
    expect(formatErrorType('game_rules_error')).toBe('Game Rules Error');
    expect(formatErrorType('procedure_error')).toBe('Procedure Error');
  });

  it('should sort errors by severity', () => {
    const errors = [
      { id: 1, severity: 'low' },
      { id: 2, severity: 'critical' },
      { id: 3, severity: 'high' },
      { id: 4, severity: 'medium' },
    ];

    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const sorted = [...errors].sort((a, b) => 
      severityOrder[a.severity] - severityOrder[b.severity]
    );

    expect(sorted[0].severity).toBe('critical');
    expect(sorted[1].severity).toBe('high');
    expect(sorted[2].severity).toBe('medium');
    expect(sorted[3].severity).toBe('low');
  });
});

describe('Month/Year Selection', () => {
  it('should correctly calculate previous month', () => {
    const getPrevMonth = (month: number, year: number) => {
      if (month === 1) {
        return { month: 12, year: year - 1 };
      }
      return { month: month - 1, year };
    };

    expect(getPrevMonth(1, 2026)).toEqual({ month: 12, year: 2025 });
    expect(getPrevMonth(6, 2026)).toEqual({ month: 5, year: 2026 });
    expect(getPrevMonth(12, 2026)).toEqual({ month: 11, year: 2026 });
  });

  it('should generate correct month labels', () => {
    const MONTHS = [
      { value: 1, label: 'January' },
      { value: 2, label: 'February' },
      { value: 3, label: 'March' },
      { value: 4, label: 'April' },
      { value: 5, label: 'May' },
      { value: 6, label: 'June' },
      { value: 7, label: 'July' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'October' },
      { value: 11, label: 'November' },
      { value: 12, label: 'December' },
    ];

    expect(MONTHS.find(m => m.value === 1)?.label).toBe('January');
    expect(MONTHS.find(m => m.value === 12)?.label).toBe('December');
    expect(MONTHS.length).toBe(12);
  });
});
