import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;
  const secure = isSecureRequest(req);

  // If COOKIE_DOMAIN is explicitly configured, use it
  const configuredDomain = ENV.cookieDomain.trim();
  if (configuredDomain) {
    const domain = configuredDomain.startsWith(".")
      ? configuredDomain
      : `.${configuredDomain}`;
    console.log("[Cookie] Using configured domain:", domain);
    return { domain, httpOnly: true, path: "/", sameSite: "none", secure };
  }

  // For localhost / IP addresses: don't set domain at all
  if (!hostname || LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    console.log("[Cookie] Local/IP host, no domain set");
    return { httpOnly: true, path: "/", sameSite: "none", secure };
  }

  // For production domains: DON'T set domain explicitly.
  // When domain is omitted, the browser scopes the cookie to the exact
  // origin hostname (no subdomain sharing), which is the safest default
  // and avoids issues with multi-level subdomains like x.y.manus.space.
  console.log("[Cookie] Production host:", hostname, "- not setting domain (browser will use exact origin)");
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure,
  };
}
