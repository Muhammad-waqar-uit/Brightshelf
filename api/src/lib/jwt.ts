import jwt from 'jsonwebtoken';
import { env } from './env';

function getJwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured in the environment');
  }
  return env.JWT_SECRET;
}

const jwtSecret = getJwtSecret();

export function signToken(payload: object, opts?: jwt.SignOptions) {
  return jwt.sign(payload, jwtSecret, { algorithm: 'HS256', ...opts });
}

export function verifyToken(token: string): jwt.JwtPayload {
  const payload = jwt.verify(token, jwtSecret);
  if (typeof payload === 'string') {
    throw new Error('Invalid JWT payload');
  }
  return payload;
}
