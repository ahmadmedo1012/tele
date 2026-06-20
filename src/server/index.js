import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

import { setupRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';
import { authMiddleware, generateToken, checkRateLimit } from './auth.js';
import { getDb } from './db.js';

getDb();

app.post('/api/register', async (req, res) => {
  try {
    if (!checkRateLimit(req.ip)) return res.status(429).json({ error: 'Too many requests' });
    const { default: bcrypt } = await import('bcryptjs');
    const { v4: uuid } = await import('uuid');
    const { username, password, display_name } = req.body;

    if (!username || typeof username !== 'string') return res.status(400).json({ error: 'Username required' });
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 30);
    if (cleanUser.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
    if (existing) return res.status(409).json({ error: 'Username taken' });

    const hash = await bcrypt.hash(password, 12);
    const id = uuid();
    db.prepare('INSERT INTO users (id, username, display_name, password_hash) VALUES (?,?,?,?)')
      .run(id, cleanUser, (display_name || cleanUser).trim().substring(0, 50), hash);
    const user = db.prepare('SELECT id, username, display_name, bio, status, created_at, theme, lang FROM users WHERE id = ?').get(id);
    res.json({ user, token: generateToken(user) });
  } catch (e) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    if (!checkRateLimit(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const { default: bcrypt } = await import('bcryptjs');
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'All fields required' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid username or password' });
    const { password_hash, ...safe } = user;
    res.json({ user: safe, token: generateToken(safe) });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.use('/api', authMiddleware);
setupRoutes(app);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../../dist/index.html')));
}

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Tele running on http://localhost:${PORT}`);
});
