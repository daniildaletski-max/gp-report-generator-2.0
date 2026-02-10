export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ============================
// Score Configuration
// ============================
/** Maximum scores per evaluation category */
export const SCORE_CONFIG = {
  hair: { max: 3, label: "Hair" },
  makeup: { max: 3, label: "Makeup" },
  outfit: { max: 3, label: "Outfit" },
  posture: { max: 3, label: "Posture" },
  dealingStyle: { max: 5, label: "Dealing Style" },
  gamePerformance: { max: 5, label: "Game Performance" },
} as const;

/** Total max appearance score (Hair + Makeup + Outfit + Posture) */
export const MAX_APPEARANCE_SCORE = 12; // 3 + 3 + 3 + 3
/** Total max game performance score (Dealing Style + Game Performance) */
export const MAX_GAME_PERFORMANCE_SCORE = 10; // 5 + 5
/** Total max evaluation score */
export const MAX_TOTAL_SCORE = 22; // 12 + 10

// ============================
// Month Names
// ============================
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// ============================
// Performance Thresholds
// ============================
export const PERFORMANCE_THRESHOLDS = {
  excellent: 20,
  good: 18,
  needsImprovement: 16,
} as const;
