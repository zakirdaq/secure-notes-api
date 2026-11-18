/**
 * Seeds an admin, a set of users with overlapping interests, notes and posts.
 * Run with: npm run seed
 */
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connect.js';
import { User, ROLES } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

const INTEREST_POOL = [
  'chess', 'reading', 'cycling', 'cooking', 'photography',
  'hiking', 'music', 'gaming', 'gardening', 'running'
];

const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

async function run() {
  await connectToDatabase();
  console.log('Connected. Clearing collections…');

  await Promise.all([
    User.deleteMany({}),
    Note.deleteMany({}),
    Post.deleteMany({})
  ]);

  const passwordHash = await User.hashPassword('Password123!');

  const admin = await User.create({
    name: 'Ada Admin',
    email: 'admin@example.com',
    passwordHash,
    role: ROLES.ADMIN,
    interests: pick(INTEREST_POOL, 3)
  });

  const users = await User.create(
    Array.from({ length: 24 }, (_, i) => ({
      name: `User ${String(i + 1).padStart(2, '0')}`,
      email: `user${i + 1}@example.com`,
      passwordHash,
      role: ROLES.USER,
      interests: pick(INTEREST_POOL, 1 + (i % 4))
    }))
  );

  const everyone = [admin, ...users];

  const notes = [];
  const posts = [];

  for (const user of everyone) {
    const noteCount = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < noteCount; i++) {
      notes.push({
        owner: user._id,
        title: `${user.name} — note ${i + 1}`,
        body: `Private note body ${i + 1} for ${user.email}.`
      });
    }

    const postCount = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < postCount; i++) {
      posts.push({
        author: user._id,
        title: `${user.name} — post ${i + 1}`,
        body: `Public post body ${i + 1}.`
      });
    }
  }

  await Note.insertMany(notes);
  await Post.insertMany(posts);

  // Make sure every schema.index() declaration actually exists in the database.
  await Promise.all([User.syncIndexes(), Note.syncIndexes(), Post.syncIndexes()]);

  console.log(`Seeded ${everyone.length} users, ${notes.length} notes, ${posts.length} posts.`);
  console.log('');
  console.log('  admin  admin@example.com / Password123!');
  console.log('  user   user1@example.com / Password123!');
  console.log('');
  console.log(`  admin id: ${admin._id}`);

  await disconnectFromDatabase();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
