import { sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull(),
  phone: text("phone").notNull().unique(),
  password: text("password").notNull(),
  balance: integer("balance").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: integer("referred_by"),
  bankName: text("bank_name"),
  ifscCode: text("ifsc_code"),
  accountNumber: text("account_number"),
  accountHolderName: text("account_holder_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gameRounds = pgTable("game_rounds", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  roundNumber: integer("round_number").notNull(),
  resultColor: text("result_color").notNull(),
  resultNumber: integer("result_number").notNull().default(0),
  scheduledTime: text("scheduled_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bets = pgTable("bets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  roundId: integer("round_id").notNull(),
  betType: text("bet_type").notNull().default("color"),
  betColor: text("bet_color"),
  betNumber: integer("bet_number"),
  betAmount: integer("bet_amount").notNull(),
  won: boolean("won"),
  winAmount: integer("win_amount").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  paymentId: text("payment_id"),
  utrId: text("utr_id"),
  referenceId: text("reference_id"),
  upiApp: text("upi_app"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gameState = pgTable("game_state", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  currentRound: integer("current_round").notNull().default(1),
  phase: text("phase").notNull().default("waiting"),
  countdown: integer("countdown").notNull().default(0),
  lastResult: text("last_result"),
  lastResultNumber: integer("last_result_number"),
  nextResult: text("next_result"),
  nextResultNumber: integer("next_result_number"),
  nextScheduledTime: text("next_scheduled_time"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  phone: true,
  password: true,
});

export const loginSchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(4),
});

export const insertBetSchema = z.object({
  betType: z.enum(["color", "number"]),
  betColor: z.enum(["red", "yellow", "green"]).optional(),
  betNumber: z.number().min(0).max(9).optional(),
  betAmount: z.number().min(10).max(100000),
});

export const addMoneySchema = z.object({
  amount: z.number().min(100).max(100000),
});

export const submitDepositSchema = z.object({
  amount: z.number().min(100),
  paymentId: z.string(),
  utrId: z.string().min(6),
  upiApp: z.string().optional(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type GameRound = typeof gameRounds.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type GameState = typeof gameState.$inferSelect;
export type Setting = typeof settings.$inferSelect;
