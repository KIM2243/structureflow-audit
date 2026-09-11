import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  passwordIterations: integer('password_iterations').notNull().default(100000),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: integer('locked_until'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastLoginAt: integer('last_login_at'),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [index('idx_sessions_user_id').on(table.userId), index('idx_sessions_expires_at').on(table.expiresAt)]);

export const watchlistItems = sqliteTable('watchlist_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  market: text('market', { enum: ['US', 'KR'] }).notNull(),
  ticker: text('ticker').notNull(),
  exchange: text('exchange', { enum: ['NA', 'ND', 'NY'] }),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_watchlist_user_market_ticker').on(table.userId, table.market, table.ticker),
  index('idx_watchlist_user_market_position').on(table.userId, table.market, table.position),
]);

export const autoPaperRuns = sqliteTable('auto_paper_runs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  instrument: text('instrument').notNull(),
  config: text('config').notNull(),
  state: text('state').notNull(),
  enabled: integer('enabled').notNull().default(1),
  hasPosition: integer('has_position').notNull().default(0),
  closeRequested: integer('close_requested').notNull().default(0),
  revision: integer('revision').notNull().default(0),
  checkedAt: integer('checked_at').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('idx_auto_user_instrument').on(table.userId,table.instrument),index('idx_auto_due').on(table.checkedAt)]);

export const autoPaperRuntime = sqliteTable('auto_paper_runtime', {
  id: text('id').primaryKey(),
  heartbeatAt: integer('heartbeat_at').notNull(),
});
export const entryReviews = sqliteTable('entry_reviews', {
  id:text('id').primaryKey(),
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  runId:text('run_id').notNull(),
  decisionAt:integer('decision_at').notNull(),
  decision:text('decision').notNull(),
  draft:text('draft').notNull(),
  replayKey:text('replay_key'),
  revision:integer('revision').notNull().default(0),
  updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('idx_entry_review_identity').on(t.userId,t.runId,t.decisionAt),index('idx_entry_review_updated').on(t.userId,t.updatedAt)]);
