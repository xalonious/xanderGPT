import argon2 from 'argon2';

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    hashLength: 32,
    timeCost: 3,
    memoryCost: 65536,
  });
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Password hash is missing or invalid');
  }

  return argon2.verify(hash, password);
};