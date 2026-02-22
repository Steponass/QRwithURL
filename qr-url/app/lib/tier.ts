/**
 * tier.ts
 *
 * Defines what each subscription plan (free / pro) can access.
 *
 * Why a separate file instead of inline checks?
 *   1. Single source of truth: "can free users see device breakdown?"
 *      is answered in ONE place, not scattered across components.
 *   2. Easy to test: pass a plan string, get permissions back.
 *   3. Easy to extend: adding a "team" plan means adding one entry.
 *
 * How tier gating works end-to-end:
 *   1. users table has a `plan` column (default 'free')
 *   2. Route loader reads user's plan from D1
 *   3. Loader calls getTierPermissions(plan)
 *   4. Loader skips expensive queries that the tier can't see
 *   5. Component receives permissions in loaderData
 *   6. Component shows content or upgrade prompt based on permissions
 */

import {
  FREE_MAX_URLS,
  FREE_MAX_QR_CODES,
  PRO_MAX_URLS,
  PRO_MAX_QR_CODES,
} from "~/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The plan values stored in the database.
 * Must be kept in sync with the `plan` column in the users table.
 */
export type UserPlan = "free" | "pro";

export interface TierPermissions {
  plan: UserPlan;

  maxUrls: number;
  maxQrCodes: number;

  // --- Analytics features ---
  /** Summary stats: total clicks + last clicked (everyone gets this) */
  hasBasicAnalytics: boolean;
  /** Unique visitors count in summary */
  hasUniqueVisitors: boolean;
  /** Timeline chart with unique visitors overlay */
  hasTimelineUniqueOverlay: boolean;
  /** Top referrers list */
  hasReferrers: boolean;
  /** Device breakdown donut chart */
  hasDeviceBreakdown: boolean;
  /** Country breakdown bar chart */
  hasCountryBreakdown: boolean;
  /** Activity heatmap (day × hour) */
  hasActivityHeatmap: boolean;
}

// ---------------------------------------------------------------------------
// Permissions by plan
// ---------------------------------------------------------------------------

const FREE_PERMISSIONS: TierPermissions = {
  plan: "free",
  maxUrls: FREE_MAX_URLS,
  maxQrCodes: FREE_MAX_QR_CODES,
  hasBasicAnalytics: true,
  hasUniqueVisitors: false,
  hasTimelineUniqueOverlay: false,
  hasReferrers: true,
  hasDeviceBreakdown: false,
  hasCountryBreakdown: false,
  hasActivityHeatmap: false,
};

const PRO_PERMISSIONS: TierPermissions = {
  plan: "pro",
  maxUrls: PRO_MAX_URLS,
  maxQrCodes: PRO_MAX_QR_CODES,
  hasBasicAnalytics: true,
  hasUniqueVisitors: true,
  hasTimelineUniqueOverlay: true,
  hasReferrers: true,
  hasDeviceBreakdown: true,
  hasCountryBreakdown: true,
  hasActivityHeatmap: true,
};

const PLAN_MAP: Record<UserPlan, TierPermissions> = {
  free: FREE_PERMISSIONS,
  pro: PRO_PERMISSIONS,
};


// Public API

/**
 * Returns the full permissions object for a given plan.
 *
 * @param plan - The user's plan from the database. Defaults to "free"
 *               if null/undefined (e.g. user has no row in users table).
 */
export function getTierPermissions(plan: string | null | undefined): TierPermissions {
  const normalizedPlan = (plan ?? "free") as UserPlan;

  return PLAN_MAP[normalizedPlan] ?? FREE_PERMISSIONS;
}

/**
 * Checks if a plan string is a valid UserPlan.
 * Useful for server-side validation.
 */
export function isValidPlan(plan: string): plan is UserPlan {
  return plan === "free" || plan === "pro";
}