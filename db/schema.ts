import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

// Only the server reads snapshots; private roles never have a public endpoint.
export const gameRooms = pgTable('game_rooms', {
  code: text('code').primaryKey(),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
