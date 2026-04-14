import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, gameRounds, bets, transactions, gameState, settings,
  type User, type InsertUser, type GameRound, type Bet, type Transaction, type GameState, type Setting,
} from "@shared/schema";

export class DatabaseStorage {
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return result[0];
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
    return result[0];
  }

  async createUser(user: any): Promise<User> {
    const referralCode = user.referralCode || Math.random().toString(36).substring(2, 8).toUpperCase();
    const result = await db.insert(users).values({ ...user, referralCode }).returning();
    return result[0];
  }

  async updateUserBalance(id: number, amount: number): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({ balance: sql`${users.balance} + ${amount}` })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserBankDetails(id: number, details: any): Promise<User | undefined> {
    const result = await db.update(users).set(details).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getGameState(): Promise<GameState | undefined> {
    const result = await db.select().from(gameState).limit(1);
    return result[0];
  }

  async createGameState(): Promise<GameState> {
    const result = await db.insert(gameState).values({
      currentRound: 1,
      phase: "waiting",
      countdown: 0,
    }).returning();
    return result[0];
  }

  async updateGameState(updates: Partial<GameState>): Promise<GameState | undefined> {
    const state = await this.getGameState();
    if (!state) return undefined;
    const result = await db
      .update(gameState)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameState.id, state.id))
      .returning();
    return result[0];
  }

  async createGameRound(roundNumber: number, resultColor: string, resultNumber: number, scheduledTime: string): Promise<GameRound> {
    const result = await db.insert(gameRounds).values({ roundNumber, resultColor, resultNumber, scheduledTime }).returning();
    return result[0];
  }

  async getRecentRounds(limit: number): Promise<GameRound[]> {
    return await db.select().from(gameRounds).orderBy(desc(gameRounds.id)).limit(limit);
  }

  async getRoundById(id: number): Promise<GameRound | undefined> {
    const result = await db.select().from(gameRounds).where(eq(gameRounds.id, id)).limit(1);
    return result[0];
  }

  async createBet(userId: number, roundId: number, betType: string, betColor: string | null, betNumber: number | null, betAmount: number): Promise<Bet> {
    const result = await db.insert(bets).values({ userId, roundId, betType, betColor, betNumber, betAmount }).returning();
    return result[0];
  }

  async getBetsForRound(roundId: number): Promise<Bet[]> {
    return await db.select().from(bets).where(eq(bets.roundId, roundId));
  }

  async getUserBets(userId: number, limit: number): Promise<Bet[]> {
    return await db.select().from(bets).where(eq(bets.userId, userId)).orderBy(desc(bets.id)).limit(limit);
  }

  async updateBetResult(betId: number, won: boolean, winAmount: number): Promise<void> {
    await db.update(bets).set({ won, winAmount }).where(eq(bets.id, betId));
  }

  async getLiveBetStats(): Promise<any> {
    const state = await this.getGameState();
    if (!state) return { colors: {}, numbers: {}, total: 0 };

    const currentRoundId = state.currentRound;
    const roundBets = await db.select().from(bets).where(eq(bets.roundId, currentRoundId));

    const colorStats: Record<string, { count: number; total: number }> = {
      red: { count: 0, total: 0 },
      yellow: { count: 0, total: 0 },
      green: { count: 0, total: 0 },
    };
    const numberStats: Record<string, { count: number; total: number }> = {};
    for (let i = 0; i <= 9; i++) {
      numberStats[i.toString()] = { count: 0, total: 0 };
    }

    let totalAmount = 0;
    for (const bet of roundBets) {
      totalAmount += bet.betAmount;
      if (bet.betType === "color" && bet.betColor) {
        colorStats[bet.betColor].count++;
        colorStats[bet.betColor].total += bet.betAmount;
      } else if (bet.betType === "number" && bet.betNumber !== null) {
        numberStats[bet.betNumber.toString()].count++;
        numberStats[bet.betNumber.toString()].total += bet.betAmount;
      }
    }

    return { colors: colorStats, numbers: numberStats, total: totalAmount, betCount: roundBets.length };
  }

  async createTransaction(userId: number, type: string, amount: number, status: string, paymentId?: string, utrId?: string, upiApp?: string, note?: string): Promise<Transaction> {
    const result = await db.insert(transactions).values({ userId, type, amount, status, paymentId, utrId, upiApp, note }).returning();
    return result[0];
  }

  async getUserTransactions(userId: number, limit: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.id)).limit(limit);
  }

  async getAllTransactions(limit: number = 200): Promise<Transaction[]> {
    return await db.select().from(transactions).orderBy(desc(transactions.id)).limit(limit);
  }

  async getPendingTransactions(): Promise<(Transaction & { username: string; phone: string })[]> {
    const result = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        type: transactions.type,
        amount: transactions.amount,
        status: transactions.status,
        paymentId: transactions.paymentId,
        utrId: transactions.utrId,
        referenceId: transactions.referenceId,
        upiApp: transactions.upiApp,
        note: transactions.note,
        createdAt: transactions.createdAt,
        username: users.username,
        phone: users.phone,
      })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .where(eq(transactions.status, "pending"))
      .orderBy(desc(transactions.id));
    return result as any;
  }

  async updateTransactionStatus(id: number, status: string, note?: string): Promise<void> {
    const updates: any = { status };
    if (note) updates.note = note;
    await db.update(transactions).set(updates).where(eq(transactions.id, id));
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    return result[0];
  }

  async getSetting(key: string): Promise<string | null> {
    const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return result[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }
}

export const storage = new DatabaseStorage();
