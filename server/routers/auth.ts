import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    // Clear cookie with computed domain
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
    // Also clear without domain (covers localhost and direct access)
    ctx.res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 });
    // Clear with hostname as domain
    const hostname = ctx.req.hostname;
    if (hostname) {
      ctx.res.clearCookie(COOKIE_NAME, { domain: hostname, path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 });
      ctx.res.clearCookie(COOKIE_NAME, { domain: `.${hostname}`, path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 });
    }
    // Set expired cookie header as additional fallback
    ctx.res.setHeader('Set-Cookie', [
      `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=None; Secure`,
      `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure`,
    ]);
    return { success: true } as const;
  }),
});
