import { prisma } from "../data";
import { hashPassword, verifyPassword } from "../core/password";
import { generateJWT } from "../core/authJwt";
import ServiceError from "../core/ServiceError";

export const registerUser = async (email: string, password: string) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ServiceError.conflict("A user with this email already exists");

  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, createdAt: true },
  });
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) throw ServiceError.unauthorized("Invalid email or password");

  let ok = false;
  try {
    ok = await verifyPassword(password, user.passwordHash);
  } catch {
    ok = false;
  }
  if (!ok) throw ServiceError.unauthorized("Invalid email or password");

  const token = await generateJWT({ id: user.id, email: user.email });

  return {
    token,
    user: { id: user.id, email: user.email },
  };
};