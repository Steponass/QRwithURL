/**
 *
 *
 * TODO: SITE_DOMAIN should move to an environment variable once domain is purchased.
 */

/**
 * The root domain used to construct short URLs for display.
 * Does NOT include protocol (https://) or trailing slash.
 */
export const SITE_DOMAIN = "yourdomain.com";

/**
 * Maximum URLs per free-tier user.
 * Used in both the form (to show "X of Y used") and the server
 * action (to reject creation above the limit).
 */
export const FREE_MAX_URLS = 10;

/**
 * Maximum QR codes per free-tier user.
 */
export const FREE_MAX_QR_CODES = 10;

/**
 * Maximum URLs per paid-tier user.
 */
export const PRO_MAX_URLS = 500;

/**
 * Maximum QR codes per paid-tier user.
 */
export const PRO_MAX_QR_CODES = 500;