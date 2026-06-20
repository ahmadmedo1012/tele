import { getDb } from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const db = getDb();

console.log('Seeding database...');

db.exec('DELETE FROM message_reactions');
db.exec('DELETE FROM messages');
db.exec('DELETE FROM chat_clear');
db.exec('DELETE FROM chat_participants');
db.exec('DELETE FROM chats');
db.exec('DELETE FROM users');

const hash = bcrypt.hashSync('pass123', 12);

const users = [
  { username: 'alice', display_name: 'Alice', bio: 'Full-stack developer & coffee lover ☕' },
  { username: 'bob', display_name: 'Bob', bio: 'Designer & photographer 📸' },
  { username: 'charlie', display_name: 'Charlie', bio: 'DevOps engineer, always deploying 🚀' },
  { username: 'diana', display_name: 'Diana', bio: 'Product manager & cat person 🐱' },
  { username: 'eve', display_name: 'Eve', bio: 'Data scientist, Python enthusiast 🐍' },
];

const userIds = {};
const ins = db.prepare('INSERT INTO users (id, username, display_name, password_hash, status, bio) VALUES (?,?,?,?,?,?)');

for (const u of users) {
  const id = uuid();
  ins.run(id, u.username, u.display_name, hash, 'offline', u.bio);
  userIds[u.username] = id;
}

// Private chats
const chatAliceBob = uuid();
db.prepare('INSERT INTO chats (id, type, created_by) VALUES (?,?,?)').run(chatAliceBob, 'private', userIds.alice);
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatAliceBob, userIds.alice, 'owner');
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatAliceBob, userIds.bob, 'member');

const chatAliceCharlie = uuid();
db.prepare('INSERT INTO chats (id, type, created_by) VALUES (?,?,?)').run(chatAliceCharlie, 'private', userIds.alice);
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatAliceCharlie, userIds.alice, 'owner');
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatAliceCharlie, userIds.charlie, 'member');

const chatBobDiana = uuid();
db.prepare('INSERT INTO chats (id, type, created_by) VALUES (?,?,?)').run(chatBobDiana, 'private', userIds.bob);
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatBobDiana, userIds.bob, 'owner');
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatBobDiana, userIds.diana, 'member');

const chatCharlieEve = uuid();
db.prepare('INSERT INTO chats (id, type, created_by) VALUES (?,?,?)').run(chatCharlieEve, 'private', userIds.charlie);
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatCharlieEve, userIds.charlie, 'owner');
db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)').run(chatCharlieEve, userIds.eve, 'member');

// Groups
const devTeam = uuid();
db.prepare('INSERT INTO chats (id, type, name, created_by) VALUES (?,?,?,?)').run(devTeam, 'group', 'Dev Team 🚀', userIds.alice);
for (const uid of Object.values(userIds)) {
  db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)')
    .run(devTeam, uid, uid === userIds.alice ? 'owner' : 'member');
}

const designClub = uuid();
db.prepare('INSERT INTO chats (id, type, name, created_by) VALUES (?,?,?,?)').run(designClub, 'group', 'Design Club 🎨', userIds.bob);
for (const u of ['bob', 'alice', 'diana']) {
  db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)')
    .run(designClub, userIds[u], u === 'bob' ? 'owner' : 'member');
}

const gamingSquad = uuid();
db.prepare('INSERT INTO chats (id, type, name, created_by) VALUES (?,?,?,?)').run(gamingSquad, 'group', 'Gaming Squad 🎮', userIds.charlie);
for (const u of ['charlie', 'bob', 'eve']) {
  db.prepare('INSERT INTO chat_participants (chat_id, user_id, role) VALUES (?,?,?)')
    .run(gamingSquad, userIds[u], u === 'charlie' ? 'owner' : 'member');
}

// Messages
const msgIns = db.prepare('INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES (?,?,?,?,?)');
const allChats = [chatAliceBob, chatAliceCharlie, chatBobDiana, chatCharlieEve, devTeam, designClub, gamingSquad];

const conversations = {
  [chatAliceBob]: [
    ['alice', 'Hey Bob! how\'s the project going?'],
    ['bob', 'Almost done! Just need to polish the UI.'],
    ['alice', 'Want me to review your pull request?'],
    ['bob', 'That would be great! I\'ll send it over.'],
    ['alice', 'Also, did you see the new Figma updates?'],
    ['bob', 'Not yet, let me check.'],
    ['alice', 'They added some amazing new components!'],
    ['bob', 'Perfect timing for our redesign! 🎉'],
  ],
  [chatAliceCharlie]: [
    ['alice', 'Charlie, can you deploy the latest build?'],
    ['charlie', 'Sure, let me run the tests first.'],
    ['alice', 'Tests passed on my end.'],
    ['charlie', 'Deploying now... done! 🚀'],
    ['alice', 'Awesome! The new features are live!'],
    ['charlie', 'I\'ll keep an eye on the logs.'],
  ],
  [chatBobDiana]: [
    ['bob', 'Diana, the new design system is ready for review.'],
    ['diana', 'Great! Send me the link.'],
    ['bob', 'Here you go: http://localhost:3000/preview'],
    ['diana', 'Looks clean! Love the color palette.'],
    ['bob', 'Thanks! I used your suggestions.'],
    ['diana', 'The typography choices are perfect.'],
    ['bob', 'Let me know if you want any changes.'],
  ],
  [chatCharlieEve]: [
    ['charlie', 'Eve, have you looked at the ML pipeline?'],
    ['eve', 'Yes! I optimized the training script.'],
    ['charlie', 'What kind of speedup did you get?'],
    ['eve', 'About 3x faster with the new batch size!'],
    ['charlie', 'That\'s incredible! Well done.'],
    ['eve', 'I\'ll share the benchmark results.'],
  ],
  [devTeam]: [
    ['alice', 'Welcome to Dev Team! Let\'s build something amazing! 🚀'],
    ['bob', 'Ready to code! 💻'],
    ['charlie', 'Deploy pipeline is set up.'],
    ['diana', 'Let\'s plan the next sprint!'],
    ['eve', 'I\'ll handle the ML models.'],
    ['alice', 'Great team! Who wants to lead the frontend?'],
    ['bob', 'I can take it!'],
    ['charlie', 'I\'ll handle the infrastructure.'],
    ['diana', 'Perfect. Let\'s sync daily at 10am.'],
    ['alice', 'Agreed! Let\'s make this the best product yet! 🌟'],
  ],
  [designClub]: [
    ['bob', 'Welcome to Design Club! 🎨'],
    ['alice', 'Love the new color palette!'],
    ['diana', 'The gradients look amazing.'],
    ['bob', 'Thanks! I\'ve been experimenting with glassmorphism.'],
    ['alice', 'That would look great on the dashboard!'],
    ['diana', 'Let\'s use it for the new onboarding screen.'],
    ['bob', 'Perfect! I\'ll prepare the mockups.'],
  ],
  [gamingSquad]: [
    ['charlie', 'Who\'s up for some gaming tonight? 🎮'],
    ['bob', 'Count me in! What are we playing?'],
    ['eve', 'I\'m in! Let\'s do some co-op.'],
    ['charlie', 'How about Valheim? New update dropped!'],
    ['bob', 'Yesss! I\'ve been waiting for this!'],
    ['eve', 'I\'ll host the server.'],
  ],
};

let baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
for (const chatId of allChats) {
  const msgs = conversations[chatId] || [];
  for (let i = 0; i < msgs.length; i++) {
    const time = new Date(baseTime + (i + 1) * (24 * 60 * 60 * 1000 / msgs.length)).toISOString();
    msgIns.run(uuid(), chatId, userIds[msgs[i][0]], msgs[i][1], time);
  }
  // Update last_message_at
  db.prepare("UPDATE chats SET last_message_at = ? WHERE id = ?").run(
    new Date(baseTime + msgs.length * (24 * 60 * 60 * 1000 / (msgs.length || 1))).toISOString(),
    chatId
  );
}

console.log('✅ Database seeded successfully!');
console.log('');
console.log('📋 Demo Accounts:');
users.forEach(u => console.log(`   ${u.username} / pass123${u === users[0] ? ' (default login)' : ''}`));
console.log('');
console.log('💬 Chats created:');
console.log(`   Private: Alice↔Bob, Alice↔Charlie, Bob↔Diana, Charlie↔Eve`);
console.log(`   Groups:  Dev Team (5), Design Club (3), Gaming Squad (3)`);
console.log(`   Total messages: ~${Object.values(conversations).flat().length}`);
