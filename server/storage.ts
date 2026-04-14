import { eq, desc, sql, and, gte, lt } from "drizzle-orm";
import { db } from "./db";
import {
  users, gameRounds, bets, transactions, gameState, settings, upiAccounts, adminLogs,
  type User, type GameRound, type Bet, type Transaction, type GameState, type Setting, type UpiAccount, type AdminLog,
} from "@shared/schema";

export class DatabaseStorage {
  // ===================== USERS =====================
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

  async setUserBalance(id: number, newBalance: number): Promise<User | undefined> {
    const result = await db.update(users).set({ balance: newBalance }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async updateUserBankDetails(id: number, details: any): Promise<User | undefined> {
    const result = await db.update(users).set(details).where(eq(users.id, id)).returning();
    return result[0];
  }

  async banUser(id: number, banned: boolean): Promise<User | undefined> {
    const result = await db.update(users).set({ isBanned: banned }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(result[0]?.count ?? 0);
  }

  // ===================== GAME STATE =====================
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

  // ===================== GAME ROUNDS =====================
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

  // ===================== BETS =====================
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
    if (!state) return { colors: {}, numbers: {}, total: 0, bets: [] };

    const currentRoundId = state.currentRound;
    const roundBets = await db
      .select({
        id: bets.id,
        userId: bets.userId,
        betType: bets.betType,
        betColor: bets.betColor,
        betNumber: bets.betNumber,
        betAmount: bets.betAmount,
        createdAt: bets.createdAt,
        username: users.username,
      })
      .from(bets)
      .leftJoin(users, eq(bets.userId, users.id))
      .where(eq(bets.roundId, currentRoundId))
      .orderBy(desc(bets.id))
      .limit(50);

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
        numberStats[bet.betNumber!.toString()].count++;
        numberStats[bet.betNumber!.toString()].total += bet.betAmount;
      }
    }

    return { colors: colorStats, numbers: numberStats, total: totalAmount, betCount: roundBets.length, bets: roundBets };
  }

  async getTodayBetStats(): Promise<{ totalBets: number; totalAmount: number }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(bet_amount), 0)` })
      .from(bets)
      .where(gte(bets.createdAt, todayStart));
    return { totalBets: Number(result[0]?.count ?? 0), totalAmount: Number(result[0]?.total ?? 0) };
  }

  // ===================== TRANSACTIONS =====================
  async createTransaction(userId: number, type: string, amount: number, status: string, paymentId?: string, utrId?: string, upiApp?: string, note?: string, upiAccountId?: number): Promise<Transaction> {
    const result = await db.insert(transactions).values({ userId, type, amount, status, paymentId, utrId, upiApp, note, upiAccountId }).returning();
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
        upiAccountId: transactions.upiAccountId,
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

  async getTodayDepositStats(): Promise<{ total: number; count: number }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(amount), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, "deposit"), eq(transactions.status, "completed"), gte(transactions.createdAt, todayStart)));
    return { total: Number(result[0]?.total ?? 0), count: Number(result[0]?.count ?? 0) };
  }

  async getTodayWithdrawStats(): Promise<{ total: number; count: number }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(amount), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, "withdrawal"), eq(transactions.status, "completed"), gte(transactions.createdAt, todayStart)));
    return { total: Number(result[0]?.total ?? 0), count: Number(result[0]?.count ?? 0) };
  }

  async getAllTransactionsWithUser(limit: number = 200): Promise<any[]> {
    const result = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        type: transactions.type,
        amount: transactions.amount,
        status: transactions.status,
        paymentId: transactions.paymentId,
        utrId: transactions.utrId,
        upiApp: transactions.upiApp,
        upiAccountId: transactions.upiAccountId,
        note: transactions.note,
        createdAt: transactions.createdAt,
        username: users.username,
        phone: users.phone,
      })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .orderBy(desc(transactions.id))
      .limit(limit);
    return result;
  }

  // ===================== UPI ACCOUNTS =====================
  async getActiveUpiAccounts(): Promise<UpiAccount[]> {
    return await db.select().from(upiAccounts).where(eq(upiAccounts.status, "active")).orderBy(upiAccounts.id);
  }

  async getAllUpiAccounts(): Promise<UpiAccount[]> {
    return await db.select().from(upiAccounts).orderBy(desc(upiAccounts.id));
  }

  async getRandomActiveUpi(): Promise<UpiAccount | null> {
    const active = await this.getActiveUpiAccounts();
    if (!active.length) return null;
    return active[Math.floor(Math.random() * active.length)];
  }

  async createUpiAccount(upiId: string, upiName: string, qrCode?: string): Promise<UpiAccount> {
    const result = await db.insert(upiAccounts).values({ upiId, upiName, qrCode }).returning();
    return result[0];
  }

  async updateUpiAccount(id: number, updates: Partial<UpiAccount>): Promise<UpiAccount | undefined> {
    const result = await db.update(upiAccounts).set(updates).where(eq(upiAccounts.id, id)).returning();
    return result[0];
  }

  async deleteUpiAccount(id: number): Promise<void> {
    await db.delete(upiAccounts).where(eq(upiAccounts.id, id));
  }

  async incrementUpiReceived(id: number, amount: number): Promise<void> {
    await db.update(upiAccounts).set({ totalReceived: sql`${upiAccounts.totalReceived} + ${amount}` }).where(eq(upiAccounts.id, id));
  }

  // ===================== SETTINGS =====================
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

  async initDefaultSettings(): Promise<void> {
    const defaults: Record<string, string> = {
      min_bet: "10",
      max_bet: "10000",
      referral_bonus: "50",
      commission_l1: "5",
      commission_l2: "2.5",
      gst_rate: "18",
      color_multiplier: "2.0",
      number_multiplier: "9.0",
      min_withdraw: "100",
      max_withdraw: "50000",
    };
    for (const [key, value] of Object.entries(defaults)) {
      const existing = await this.getSetting(key);
      if (!existing) await this.setSetting(key, value);
    }
  }

  // ===================== ADMIN LOGS =====================
  async createAdminLog(adminId: number | undefined, action: string, details?: string, targetId?: string, targetType?: string): Promise<AdminLog> {
    const result = await db.insert(adminLogs).values({ adminId, action, details, targetId, targetType }).returning();
    return result[0];
  }

  async getAdminLogs(limit: number = 100): Promise<AdminLog[]> {
    return await db.select().from(adminLogs).orderBy(desc(adminLogs.id)).limit(limit);
  }

  // ===================== DASHBOARD STATS =====================
  async getDashboardStats(): Promise<any> {
    const [userCount, todayBets, todayDeposits, todayWithdraws] = await Promise.all([
      this.getUserCount(),
      this.getTodayBetStats(),
      this.getTodayDepositStats(),
      this.getTodayWithdrawStats(),
    ]);

    const allUsersResult = await db.select({ total: sql<number>`coalesce(sum(balance), 0)` }).from(users);
    const totalWalletBalance = Number(allUsersResult[0]?.total ?? 0);

    return {
      totalUsers: userCount,
      totalBetsToday: todayBets.totalBets,
      totalBetAmountToday: todayBets.totalAmount,
      totalDepositsToday: todayDeposits.total,
      depositCountToday: todayDeposits.count,
      totalWithdrawsToday: todayWithdraws.total,
      withdrawCountToday: todayWithdraws.count,
      totalWalletBalance,
      estimatedProfit: todayDeposits.total - todayWithdraws.total,
    };
  }

  async getProfitAnalysis(): Promise<any> {
    const state = await this.getGameState();
    if (!state) return {};

    const currentRoundId = state.currentRound;
    const roundBets = await db.select().from(bets).where(eq(bets.roundId, currentRoundId));

    const colorStats: Record<string, { count: number; total: number; payout: number; profit: number }> = {
      red: { count: 0, total: 0, payout: 0, profit: 0 },
      yellow: { count: 0, total: 0, payout: 0, profit: 0 },
      green: { count: 0, total: 0, payout: 0, profit: 0 },
    };
    const numberStats: Record<string, { count: number; total: number; payout: number; profit: number }> = {};
    for (let i = 0; i <= 9; i++) {
      numberStats[i.toString()] = { count: 0, total: 0, payout: 0, profit: 0 };
    }

    let totalPool = 0;
    for (const bet of roundBets) {
      totalPool += bet.betAmount;
      if (bet.betType === "color" && bet.betColor) {
        colorStats[bet.betColor].count++;
        colorStats[bet.betColor].total += bet.betAmount;
        colorStats[bet.betColor].payout += Math.floor(bet.betAmount * 2.0);
      } else if (bet.betType === "number" && bet.betNumber !== null) {
        numberStats[bet.betNumber!.toString()].count++;
        numberStats[bet.betNumber!.toString()].total += bet.betAmount;
        numberStats[bet.betNumber!.toString()].payout += Math.floor(bet.betAmount * 9.0);
      }
    }

    for (const key of Object.keys(colorStats)) {
      colorStats[key].profit = totalPool - colorStats[key].payout;
    }
    for (const key of Object.keys(numberStats)) {
      numberStats[key].profit = totalPool - numberStats[key].payout;
    }

    return { colors: colorStats, numbers: numberStats, totalPool, roundId: currentRoundId };
  }
}

export const storage = new DatabaseStorage();
