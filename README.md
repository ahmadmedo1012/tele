# Tele — Premium Messenger

[![GitHub](https://img.shields.io/badge/GitHub-ahmadmedo1012%2Ftele-7B6BFF?style=flat&logo=github)](https://github.com/ahmadmedo1012/tele)

A Telegram-like chat app built to run entirely locally. No external services required.

## GitHub



## Stack

- **Backend:** Node.js / Express / better-sqlite3 / ws
- **Frontend:** Vanilla JS SPA / Vite
- **Realtime:** WebSocket (native)
- **Auth:** JWT + bcrypt
- **Files:** Multer (local uploads)

## Quick Start

```bash
# Install
npm install

# Seed database with demo data
npm run seed

# Start (backend + frontend dev server)
npm run dev
```

Open http://localhost:5173

### Demo accounts

| Username | Password |
|----------|----------|
| alice    | pass123  |
| bob      | pass123  |
| charlie  | pass123  |
| diana    | pass123  |

## Features

- ✅ Secure auth (register/login)
- ✅ 1-on-1 private chats
- ✅ Group chats
- ✅ Real-time messaging (WebSocket)
- ✅ Online/offline status
- ✅ Typing indicators
- ✅ File & image uploads
- ✅ Search messages and chats
- ✅ Archive / Pin chats
- ✅ Profile editing (display name, bio, status)
- ✅ Responsive design (desktop + mobile)
- ✅ RTL language support
- ✅ Dark theme

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | Create account |
| POST | `/api/login` | Login |
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Get user |
| PUT | `/api/profile` | Update profile |
| GET | `/api/chats` | List chats (?archived=1) |
| POST | `/api/chats` | Create chat |
| PUT | `/api/chats/:id` | Update chat (archive/pin) |
| GET | `/api/chats/:id/participants` | List participants |
| POST | `/api/chats/:id/participants` | Add participants |
| DELETE | `/api/chats/:id/participants/:userId` | Remove participant |
| GET | `/api/chats/:id/messages` | Get messages (?before=&limit=) |
| POST | `/api/chats/:id/messages` | Send message (multipart) |
| DELETE | `/api/messages/:id` | Delete message |
| GET | `/api/search?q=` | Search chats & messages |

## WebSocket Events

**Client → Server:** `join_chat`, `leave_chat`, `typing`, `stop_typing`, `message`, `update_status`

**Server → Client:** `message`, `message_ack`, `typing`, `stop_typing`, `status`, `online_users`

## Project Structure

```
tele/
├── src/
│   ├── server/        # Backend
│   │   ├── index.js   # Entry point
│   │   ├── db.js      # Database setup & schema
│   │   ├── auth.js    # JWT auth
│   │   ├── routes.js  # REST API routes
│   │   ├── ws.js      # WebSocket server
│   │   └── seed.js    # Database seeder
│   └── client/        # Frontend
│       ├── main.js    # SPA entry
│       ├── styles/    # CSS
│       └── js/        # Modules (api, state, ws)
├── data/              # SQLite database
├── uploads/           # Uploaded files
├── .env               # Configuration
├── vite.config.js
└── package.json
```

## Production Build

```bash
NODE_ENV=production npm run build
npm start
```
