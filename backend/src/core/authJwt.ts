import jwt, { type Secret, type SignOptions, type VerifyOptions, type JwtPayload } from "jsonwebtoken";

export interface AuthUser {
  id: string;
  email: string;
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRY = process.env.JWT_EXPIRY ?? "7d";
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;

if (!JWT_SECRET) throw new Error("Missing env var JWT_SECRET");

const signJWT = (payload: object, secret: Secret, options?: SignOptions) =>
  new Promise<string>((resolve, reject) =>
    jwt.sign(payload, secret, options ?? {}, (err, token) => {
      if (err || !token) reject(err);
      else resolve(token);
    })
  );

const verifyJWT = (token: string, secret: Secret, options?: VerifyOptions) =>
  new Promise<JwtPayload>((resolve, reject) =>
    jwt.verify(token, secret, options ?? {}, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded as JwtPayload);
    })
  );

export const generateJWT = async (user: AuthUser): Promise<string> => {
  const payload = {
    sub: user.id,
    email: user.email,
  };

  const options: SignOptions = {
    expiresIn: JWT_EXPIRY as SignOptions["expiresIn"],
    ...(JWT_ISSUER ? { issuer: JWT_ISSUER } : {}),
    ...(JWT_AUDIENCE ? { audience: JWT_AUDIENCE } : {}),
  };

  return signJWT(payload, JWT_SECRET as Secret, options);
};

export const verifyJWTToken = async (token: string): Promise<JwtPayload> => {
  const options: VerifyOptions = {
    ...(JWT_ISSUER ? { issuer: JWT_ISSUER } : {}),
    ...(JWT_AUDIENCE ? { audience: JWT_AUDIENCE } : {}),
  };

  return verifyJWT(token, JWT_SECRET as Secret, options);
};