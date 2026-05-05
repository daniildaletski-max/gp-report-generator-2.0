/**
 * Improvement-tip library — actionable advice the GP Portal surfaces
 * next to a low-scoring criterion. Per-criterion + per-tier so the
 * tone matches the GP's current level (low / mid / high). Hardcoded
 * so the portal can render instantly without an LLM round-trip.
 *
 * Tip selection rule (used by the consumer):
 *   pct >= 90% → no tips (already excellent)
 *   pct >= 70% → "high" tier (polish / push to perfection)
 *   pct >= 40% → "mid" tier (concrete improvement actions)
 *   else       → "low" tier (foundational reset, tone is supportive)
 *
 * Each criterion key matches `SCORE_CONFIG` in shared/const.ts.
 */

export type CriterionKey =
  | "hair"
  | "makeup"
  | "outfit"
  | "posture"
  | "dealingStyle"
  | "gamePerformance";

export type TipTier = "low" | "mid" | "high";

export interface TipBundle {
  /** Short headline shown above the tip list. */
  title: string;
  /** 3-5 actionable bullets. Imperative voice, present tense. */
  tips: string[];
}

const TIPS: Record<CriterionKey, Record<TipTier, TipBundle>> = {
  hair: {
    low: {
      title: "Reset your hair routine",
      tips: [
        "Tie hair back firmly before shift — no loose strands around the face.",
        "Use a small mirror near your station for a 30-second touch-up between games.",
        "Bring spare bobby pins / hair ties so a quick fix doesn't need a break.",
      ],
    },
    mid: {
      title: "Tighten the polish",
      tips: [
        "Re-pin any flyaways during the shoe change — viewers notice motion.",
        "Match style to the table tone: sleek for high-stakes, softer for VIP.",
        "Check the back of your head with a hand mirror before going live.",
      ],
    },
    high: {
      title: "Stage-ready edge",
      tips: [
        "Lock in a signature look so regulars recognise you on camera.",
        "Coordinate hair styling with outfit changes — small details viewers remember.",
      ],
    },
  },
  makeup: {
    low: {
      title: "Foundations of camera-friendly makeup",
      tips: [
        "Apply matte foundation — studio lighting amplifies shine.",
        "Define eyes and lips clearly; subtle looks read as 'tired' on camera.",
        "Carry blotting paper / lipstick for a 60-second touch-up mid-shift.",
      ],
    },
    mid: {
      title: "Refresh between blocks",
      tips: [
        "Re-touch lipstick after every 2 hours — wears off faster than you think.",
        "Powder T-zone before going on the next shoe.",
        "Match eyeshadow tone to outfit colour; harsh contrasts distract from gameplay.",
      ],
    },
    high: {
      title: "Camera-perfect details",
      tips: [
        "Experiment with slightly bolder lip tones — they read cleaner under bright lights.",
        "Consider a longer-lasting setting spray for late shifts.",
      ],
    },
  },
  outfit: {
    low: {
      title: "Outfit reset",
      tips: [
        "Steam or iron uniform before EVERY shift — wrinkles are visible on camera.",
        "Lint-roll dark fabric immediately before going on table.",
        "Rotate spare uniform so you always have a fresh option ready.",
      ],
    },
    mid: {
      title: "Sharper presentation",
      tips: [
        "Check buttons / hems aren't loose before going live.",
        "Make sure name badge sits straight; viewers' eyes land there.",
        "Match jewelry tone to uniform — silver with cool, gold with warm tones.",
      ],
    },
    high: {
      title: "Polish that stands out",
      tips: [
        "Add a small signature accessory (within dress code) so you're recognisable.",
        "Coordinate with shift partner for a unified team look on multi-table broadcasts.",
      ],
    },
  },
  posture: {
    low: {
      title: "Reset your stance",
      tips: [
        "Stand with weight on both feet — don't lean on one hip.",
        "Roll shoulders back, lift chin slightly. Hold for 5 seconds before each shoe.",
        "Avoid crossing arms or hands behind the back — looks closed off on camera.",
      ],
    },
    mid: {
      title: "Project confidence",
      tips: [
        "Keep hands above table level when not dealing — open palms read as friendly.",
        "Lean slightly forward when calling outcomes; signals engagement.",
        "Subtle head turns toward the camera every 30s — connects with players.",
      ],
    },
    high: {
      title: "Stage presence",
      tips: [
        "Vary your energy: tighter posture for big bets, relaxed for slow tables.",
        "Use deliberate hand gestures to punctuate key moments.",
      ],
    },
  },
  dealingStyle: {
    low: {
      title: "Tighten the basics",
      tips: [
        "Slow down between cards — rushed dealing looks anxious on camera.",
        "Announce each action clearly: 'Card to player', 'Stand', 'Outcome'.",
        "Practice clean, audible chip handling — the click is part of the show.",
      ],
    },
    mid: {
      title: "Style + control",
      tips: [
        "Add small flourishes during card turns — but only when accuracy is locked.",
        "Vary your pace based on table energy: faster for high-rollers, smoother for new players.",
        "Maintain steady eye contact with the camera between actions.",
      ],
    },
    high: {
      title: "Signature dealing",
      tips: [
        "Develop a small recognisable routine for big wins — viewers love consistency.",
        "Use dealing rhythm to build anticipation; pause briefly before reveal moments.",
      ],
    },
  },
  gamePerformance: {
    low: {
      title: "Game flow basics",
      tips: [
        "Memorise the call structure — hesitation breaks the player's flow.",
        "Watch your shoe-change technique — keep it clean, no fumbles.",
        "Stay alert during slow tables; energy dip is the most-noticed flaw.",
      ],
    },
    mid: {
      title: "Lift the energy",
      tips: [
        "Greet players by chat name when they sit down — shows you're paying attention.",
        "Comment on bet sizes / streaks to keep the table conversational.",
        "End each game with a clear outcome call — never trail off.",
      ],
    },
    high: {
      title: "Charisma multipliers",
      tips: [
        "Build rapport with regular players — remember their preferences.",
        "Smooth transition between games keeps the broadcast feeling continuous.",
      ],
    },
  },
};

/**
 * Pick the tip tier for a given (score, max) pair using the rule
 * documented at the top of this file.
 */
export function pickTipTier(score: number | null | undefined, max: number): TipTier | null {
  if (score == null || max <= 0) return null;
  const pct = score / max;
  if (pct >= 0.9) return null; // already excellent — no tip needed
  if (pct >= 0.7) return "high";
  if (pct >= 0.4) return "mid";
  return "low";
}

export function getTips(criterion: CriterionKey, score: number | null | undefined, max: number): TipBundle | null {
  const tier = pickTipTier(score, max);
  if (!tier) return null;
  return TIPS[criterion][tier];
}
