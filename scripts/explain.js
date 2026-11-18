/**
 * Proves every required query and aggregation is index-backed.
 *
 * Run with: npm run explain   (after `npm run seed`)
 *
 * For each query it prints the winning plan's stages and the index name, and
 * flags anything that falls back to a COLLSCAN or an in-memory SORT.
 */
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connect.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

function stagesOf(plan, acc = []) {
  if (!plan) return acc;
  acc.push({ stage: plan.stage, indexName: plan.indexName });
  if (plan.inputStage) stagesOf(plan.inputStage, acc);
  if (plan.inputStages) plan.inputStages.forEach((s) => stagesOf(s, acc));
  return acc;
}

function report(label, explain) {
  // Aggregations nest the plan under the first $cursor stage.
  const queryPlanner =
    explain.queryPlanner ??
    explain.stages?.[0]?.$cursor?.queryPlanner ??
    explain.$cursor?.queryPlanner;

  const stages = stagesOf(queryPlanner?.winningPlan?.queryPlan ?? queryPlanner?.winningPlan);
  const names = stages.map((s) => s.stage);
  const index = stages.find((s) => s.indexName)?.indexName;

  const collscan = names.includes('COLLSCAN');
  const blockingSort = names.includes('SORT');

  const mark = collscan ? 'FAIL' : blockingSort ? 'WARN' : 'OK  ';

  console.log(`${mark} ${label}`);
  console.log(`     plan : ${names.join(' <- ') || '(aggregation-only stages)'}`);
  console.log(`     index: ${index ?? '(none)'}`);
  if (collscan) console.log('     !! COLLSCAN — this query is not index-backed.');
  if (blockingSort) console.log('     !! blocking in-memory SORT stage.');
  console.log('');
}

async function run() {
  await connectToDatabase();

  const user = await User.findOne({ role: 'user' }).lean();
  if (!user) throw new Error('No data. Run `npm run seed` first.');

  console.log('\n=== Index usage report ===\n');

  report(
    'Login — User.findOne({ email })',
    await User.find({ email: user.email }).explain('queryPlanner')
  );

  report(
    'Profile read — User.findById(id)',
    await User.find({ _id: user._id }).explain('queryPlanner')
  );

  report(
    "User's own notes, paginated newest-first",
    await Note.find({ owner: user._id })
      .sort({ createdAt: -1 })
      .skip(0)
      .limit(20)
      .explain('queryPlanner')
  );

  report(
    'Single note with ownership check — { _id, owner }',
    await Note.find({ _id: new mongoose.Types.ObjectId(), owner: user._id }).explain(
      'queryPlanner'
    )
  );

  report(
    'Admin: all notes, sorted _id desc',
    await Note.find({}).sort({ _id: -1 }).limit(20).explain('queryPlanner')
  );

  report(
    'Admin: all users, sorted _id desc',
    await User.find({}).sort({ _id: -1 }).limit(20).explain('queryPlanner')
  );

  report(
    'Users filtered by one interest',
    await User.find({ interests: user.interests[0] }).limit(20).explain('queryPlanner')
  );

  report(
    'Scenario 1 — users grouped by interests ($unwind + $group)',
    await User.aggregate([
      { $match: { interests: { $exists: true } } },
      { $unwind: '$interests' },
      { $group: { _id: '$interests', userCount: { $sum: 1 } } },
      { $sort: { userCount: -1, _id: 1 } }
    ]).explain('queryPlanner')
  );

  report(
    'Scenario 2 — posts of one user ($lookup)',
    await User.aggregate([
      { $match: { _id: user._id } },
      {
        $lookup: {
          from: 'posts',
          localField: '_id',
          foreignField: 'author',
          as: 'posts',
          pipeline: [{ $sort: { createdAt: -1 } }, { $limit: 21 }]
        }
      }
    ]).explain('queryPlanner')
  );

  // The $lookup's inner access path is reported separately by the server, so
  // verify the posts-side index directly too.
  report(
    'Scenario 2 — inner join probe on posts ({ author } + createdAt sort)',
    await Post.find({ author: user._id }).sort({ createdAt: -1 }).limit(21).explain('queryPlanner')
  );

  console.log('=== Declared indexes ===\n');
  for (const model of [User, Note, Post]) {
    const indexes = await model.collection.indexes();
    console.log(`${model.collection.collectionName}:`);
    for (const ix of indexes) {
      console.log(
        `  ${ix.name.padEnd(22)} ${JSON.stringify(ix.key)}${ix.unique ? ' (unique)' : ''}`
      );
    }
    console.log('');
  }

  await disconnectFromDatabase();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
