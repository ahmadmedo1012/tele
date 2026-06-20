import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tele-chat-secret';
const TOKEN_EXPIRY = '7d';
const REFRESH_EXPIRY = '30d';

const loginAttempts = new Map(); // IP -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now < entry.resetAt && entry.count >= 5) {
    return false; // blocked
  }
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
  } else {
    entry.count++;
  }
  return true;
}

export { checkRateLimit };

export function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function generateRefreshToken(user) {
  return jwt.sign({ id: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {}
  }
  next();
}

export function authWs(info, cb) {
  try {
    const url = new URL(info.req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) { cb(false, 401); return; }
    info.req.user = jwt.verify(token, JWT_SECRET);
    cb(true);
  } catch {
    cb(false, 401);
  }
}
