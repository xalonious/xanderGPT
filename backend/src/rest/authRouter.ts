import { Router } from "express";
import asyncHandler from "../core/asyncHandler";
import { validateRequest } from "../core/validation";
import { registerSchema, loginSchema } from "../validation/auth";
import * as authService from "../service/authService";
import { authCookieOptions, clearAuthCookieOptions } from "../utils/cookies";
import { requireAuthentication } from "../core/authMiddleware";

const router = Router();

router.post(
  "/register",
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await authService.registerUser(email, password);
    res.status(201).json({ user });
  })
);

router.post(
  "/login",
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const { token, user } = await authService.loginUser(email, password);

    res.cookie("auth_token", token, authCookieOptions());
    res.status(200).json({ user });
  })
);

router.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    res.clearCookie("auth_token", clearAuthCookieOptions());
    res.status(200).json({ message: "Logged out" });
  })
);

router.get(
  "/me",
  requireAuthentication,
  asyncHandler(async (req, res) => {
    res.status(200).json({ user: req.user });
  })
);

export default router;