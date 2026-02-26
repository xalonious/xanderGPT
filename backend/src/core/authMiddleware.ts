import type { RequestHandler } from "express";
import { verifyJWTToken, type AuthUser } from "../core/authJwt";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const requireAuthentication: RequestHandler = async (req, res, next) => {
  let token: string | undefined;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) token = header.slice("Bearer ".length);

  if (!token && req.cookies?.auth_token) token = req.cookies.auth_token;

  if (!token) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Missing token" });
    return;
  }

  try {
    const payload = await verifyJWTToken(token);

    const sub = payload.sub;
    const email = payload.email;

    if (typeof sub !== "string" || typeof email !== "string") {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid token payload" });
      return;
    }

    req.user = { id: sub, email };
    next();
  } catch {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
};