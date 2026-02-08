import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      console.log("[OAuth] Callback received code:", code?.substring(0, 10) + "...", "state:", state?.substring(0, 20) + "...");
      
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      console.log("[OAuth] Token exchange successful, accessToken:", tokenResponse.accessToken ? "present" : "missing");
      
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      console.log("[OAuth] User info received:", JSON.stringify({ openId: userInfo.openId, name: userInfo.name, email: userInfo.email }));

      if (!userInfo.openId) {
        console.error("[OAuth] openId missing from userInfo:", JSON.stringify(userInfo));
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });
      console.log("[OAuth] User upserted successfully:", userInfo.openId);

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      console.log("[OAuth] Session token created, length:", sessionToken?.length);

      const cookieOptions = getSessionCookieOptions(req);
      console.log("[OAuth] Cookie options:", JSON.stringify(cookieOptions));
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log("[OAuth] Redirecting to /");
      res.redirect(302, "/");
    } catch (error: any) {
      console.error("[OAuth] Callback failed. Error type:", typeof error, "Message:", error?.message || String(error));
      console.error("[OAuth] Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error || {})));
      res.status(500).json({ error: "OAuth callback failed", details: error?.message || String(error) });
    }
  });
}
