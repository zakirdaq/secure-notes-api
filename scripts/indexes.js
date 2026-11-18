/**
 * Applies every schema.index() declaration to the database and removes any
 * index that is no longer declared in code. Run this instead of relying on
 * Mongoose autoIndex in production.
 *
 * Run with: npm run indexes
 */
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connect.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

async function run() {
  await connectToDatabase();

  for (const model of [User, Note, Post]) {
    const dropped = await model.syncIndexes();
    const indexes = await model.collection.indexes();

    console.log(`\n${model.collection.collectionName}`);
    if (dropped.length) console.log(`  dropped undeclared: ${dropped.join(', ')}`);
    for (const ix of indexes) {
      console.log(
        `  ${ix.name.padEnd(22)} ${JSON.stringify(ix.key)}${ix.unique ? ' (unique)' : ''}`
      );
    }
  }

  console.log('\nDone.');
  await disconnectFromDatabase();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
