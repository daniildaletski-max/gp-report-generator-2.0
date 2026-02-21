# Quick Start Guide - System Improvements

## Installation

```bash
npm install --legacy-peer-deps
npm run build
npm run test
```

## Using the New Features

### 1. Input Validation

```typescript
import { EvaluationSchema, AttendanceSchema } from "@shared/validation";

// Validate evaluation data
const evaluation = {
  gpName: "John Doe",
  date: new Date(),
  fmName: "Jane Smith",
  performance: 8,
  attitude: 7,
  errorCount: 0,
  teamId: "team1",
};

try {
  const validated = EvaluationSchema.parse(evaluation);
  console.log("Valid data:", validated);
} catch (error) {
  console.log("Invalid data:", error);
}
```

### 2. Bonus Calculation

```typescript
import { calculateBonusEligibility } from "@/server/services/bonusCalculator";

const result = calculateBonusEligibility({
  gpId: "gp1",
  totalGamesPlayed: 5000,
  errorCount: 1,
  hoursWorked: 100,
  month: 1,
  year: 2024,
  hasDisqualifyingFactors: false,
});

console.log(`Bonus Level: ${result.bonusLevel}`);
console.log(`Bonus Amount: €${result.bonusAmount}`);
console.log(`Eligible: ${result.isEligible}`);
```

### 3. Data Validation

```typescript
import {
  validateEvaluation,
  normalizeGPName,
  fuzzyMatchGPName,
  detectDuplicates,
} from "@/server/services/dataValidation";

// Validate with warnings
const result = validateEvaluation(data);
if (result.valid) {
  console.log("Valid:", result.data);
  console.log("Warnings:", result.warnings);
} else {
  console.log("Errors:", result.errors);
}

// Fuzzy match GP names
const matches = fuzzyMatchGPName("john doe", candidates);
console.log(matches); // [{ match: "John Doe", score: 100 }]
```

### 4. Audit Logging

```typescript
import { logAuditEvent, logEvaluationChange } from "@/server/services/auditLog";

// Log an action
logAuditEvent({
  userId: "user123",
  action: "UPDATE",
  entity: "EVALUATION",
  entityId: "eval456",
  oldValues: { performance: 7 },
  newValues: { performance: 8 },
  status: "success",
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"],
});

// Log a specific evaluation change
logEvaluationChange(userId, evaluationId, oldValues, newValues, ip, ua);

// Query audit logs
const logs = getAuditLog({ userId, action: "UPDATE", limit: 50 });
```

### 5. API Responses

```typescript
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  ERROR_CODES,
} from "@/server/_core/response";

// Success response
return successResponse({ data: "result" });

// Error response
return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid input", details);

// Paginated response
return paginatedResponse(items, total, page, limit);
```

### 6. Performance Utilities

```typescript
import { debounce, throttle, compressImage, measurePerformance } from "@/client/src/lib/performance";

// Debounce search input
const debouncedSearch = debounce((query: string) => {
  // Search API call
}, 300);

// Throttle scroll events
const throttledScroll = throttle(() => {
  // Handle scroll
}, 100);

// Measure performance
await measurePerformance("API Call", async () => {
  return await fetch("/api/data");
});

// Compress images
const compressed = await compressImage(file, 0.8);
```

## API Endpoints - Adding Validation

### Before
```typescript
export const evaluationRouter = createTRPCRouter({
  create: publicProcedure.input(z.any()).mutation(async ({ input }) => {
    // Store without validation
  }),
});
```

### After
```typescript
import { EvaluationSchema } from "@shared/validation";
import { logAuditEvent } from "@/server/services/auditLog";

export const evaluationRouter = createTRPCRouter({
  create: publicProcedure
    .input(EvaluationSchema)
    .mutation(async ({ input, ctx }) => {
      // Input is already validated by Zod
      const evaluation = await db.evaluations.create(input);

      // Log the action
      logAuditEvent({
        userId: ctx.user.id,
        action: "CREATE",
        entity: "EVALUATION",
        entityId: evaluation.id,
        newValues: input,
        status: "success",
      });

      return evaluation;
    }),
});
```

## Database Optimization

### Apply Recommended Indexes

```sql
-- Run these in your database
CREATE INDEX IF NOT EXISTS idx_evaluations_gp_date ON evaluations(gp_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_fm_date ON evaluations(fm_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_team_date ON evaluations(team_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_errors_gp_date ON errors(gp_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_errors_severity ON errors(severity, resolved);
CREATE INDEX IF NOT EXISTS idx_errors_team_date ON errors(team_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_gp_date ON attendance(gp_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_team_date ON attendance(team_id, date DESC);
```

## Testing

### Run All Tests
```bash
npm run test
```

### Run Specific Test Suite
```bash
npm run test -- server/bonus-calculator.test.ts
npm run test -- server/data-validation.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test -- --watch
```

## Environment Variables

No new environment variables are required. The system uses existing configuration.

## Files to Review

1. **IMPROVEMENTS.md** - Comprehensive improvement documentation
2. **IMPLEMENTATION_SUMMARY.md** - Summary of changes
3. **shared/validation.ts** - All validation schemas
4. **server/services/bonusCalculator.ts** - Bonus calculation logic
5. **server/services/auditLog.ts** - Audit logging system
6. **server/services/dataValidation.ts** - Data validation utilities
7. **server/services/queryOptimizer.ts** - Query optimization
8. **client/src/lib/performance.ts** - Frontend performance utilities

## Common Tasks

### Add validation to a new API endpoint
1. Define schema in `shared/validation.ts`
2. Import and use in route: `.input(YourSchema)`
3. Add audit logging to mutation

### Track a new type of action
1. Add to `AuditAction` type in `auditLog.ts`
2. Create helper function like `logEvaluationChange()`
3. Call in relevant endpoints

### Optimize a slow query
1. Check recommended indexes in `queryOptimizer.ts`
2. Apply relevant indexes to database
3. Use query templates from `QUERY_TEMPLATES`

## Support

- See `IMPROVEMENTS.md` for detailed documentation
- Check test files for usage examples
- Review type definitions for API contracts

## Next Steps

1. Integrate validation into all routes
2. Apply database indexes
3. Enable audit logging in production
4. Monitor performance improvements
5. Collect feedback for Phase 2 improvements
