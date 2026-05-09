export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  /**
   * Optional explicit "from" address for outgoing email. When set,
   * bypasses the auto-detection of a verified Resend domain and
   * always stamps this address on outgoing mail. Use this when the
   * Resend API surfaces a domain status the auto-detector doesn't
   * recognise (newer Resend statuses, partial verifications), or
   * when you want a specific display name.
   *
   * Format: bare email (`reports@yourdomain.com`) or full RFC line
   * (`GP Report Generator <reports@yourdomain.com>`).
   */
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
  cookieDomain: process.env.COOKIE_DOMAIN ?? "",
  /**
   * Comma-separated list of email addresses that should always be
   * treated as admins, regardless of `users.role` in the DB. Use
   * this to bootstrap the first admin without manual SQL — and to
   * keep the system creator's account admin across DB resets.
   *
   * Example: `ADMIN_EMAILS=daniil.daletski@studioworks.ee,ops@…`
   */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
};
