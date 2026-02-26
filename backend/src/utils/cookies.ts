import type { CookieOptions } from "express";

const isProd = process.env.NODE_ENV === "production";

export const authCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, 
});

export const clearAuthCookieOptions = (): CookieOptions => ({
  ...authCookieOptions(),
  maxAge: 0,
});