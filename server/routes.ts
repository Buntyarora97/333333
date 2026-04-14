import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import { storage } from "./storage";
import { gameEngine } from "./game-engine";
import { insertUserSchema, loginSchema, insertBetSchema, addMoneySchema, submitDepositSchema } from "@shared/schema";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
  }
}

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9999999999";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// WebSocket clients set
let wss: WebSocketServer | null = null;

export function broadcastToAll(data: any) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "3batti-secret-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  await gameEngine.initialize();
  await storage.initDefaultSettings();

  // Serve web admin panel
  app.get("/admin", (_req: Request, res: Response) => {
    const adminPath = path.resolve(process.cwd(), "server", "templates", "admin-panel.html");
    if (fs.existsSync(adminPath)) {
      res.sendFile(adminPath);
    } else {
      res.status(404).send("Admin panel not found");
    }
  });

  // ===================== AUTH =====================
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { referralCodeUsed, ...userData } = req.body;
      const data = insertUserSchema.parse(userData);

      const existing = await storage.getUserByPhone(data.phone);
      if (existing) return res.status(400).json({ error: "Phone number already registered" });

      let referredBy: number | null = null;
      let referralBonus = 0;
      if (referralCodeUsed) {
        const referrer = await storage.getUserByReferralCode(referralCodeUsed);
        if (referrer) {
          referredBy = referrer.id;
          const bonusStr = await storage.getSetting("referral_bonus");
          referralBonus = parseInt(bonusStr || "50");
        }
      }

      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const user = await storage.createUser({ ...data, referralCode, referredBy });

      if (referralBonus > 0 && referredBy) {
        await storage.updateUserBalance(referredBy, referralBonus);
        await storage.createTransaction(referredBy, "referral_bonus", referralBonus, "completed", undefined, undefined, undefined, `Referral bonus for inviting ${user.username}`);
        await storage.updateUserBalance(user.id, referralBonus);
        await storage.createTransaction(user.id, "signup_bonus", referralBonus, "completed", undefined, undefined, undefined, `Signup bonus via referral`);
      }

      req.session.userId = user.id;
      req.session.isAdmin = user.isAdmin;

      res.json({ id: user.id, username: user.username, phone: user.phone, balance: user.balance, isAdmin: user.isAdmin, referralCode: user.referralCode });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const data = loginSchema.parse(req.body);

      if (data.phone === ADMIN_PHONE && data.password === ADMIN_PASSWORD) {
        let admin = await storage.getUserByPhone(ADMIN_PHONE);
        if (!admin) {
          admin = await storage.createUser({ username: "Admin", phone: ADMIN_PHONE, password: ADMIN_PASSWORD, referralCode: "ADMIN0", isAdmin: true });
        }
        req.session.userId = admin.id;
        req.session.isAdmin = true;
        return res.json({ id: admin.id, username: "Admin", phone: admin.phone, balance: admin.balance, isAdmin: true, referralCode: admin.referralCode });
      }

      const user = await storage.getUserByPhone(data.phone);
      if (!user || user.password !== data.password) {
        return res.status(401).json({ error: "Invalid phone or password" });
      }
      if (user.isBanned) {
        return res.status(403).json({ error: "Your account has been suspended. Contact support." });
      }

      req.session.userId = user.id;
      req.session.isAdmin = user.isAdmin;

      res.json({ id: user.id, username: user.username, phone: user.phone, balance: user.balance, isAdmin: user.isAdmin, referralCode: user.referralCode });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ id: user.id, username: user.username, phone: user.phone, balance: user.balance, isAdmin: user.isAdmin || req.session.isAdmin, referralCode: user.referralCode });
  });

  // ===================== GAME =====================
  app.get("/api/game/state", async (req: Request, res: Response) => {
    try {
      const state = await gameEngine.getState();
      const recentRounds = await storage.getRecentRounds(20);
      res.json({
        currentRound: state.currentRound,
        phase: state.phase,
        countdown: state.countdown,
        lastResult: state.lastResult,
        lastResultNumber: state.lastResultNumber,
        nextScheduledTime: state.nextScheduledTime,
        history: recentRounds.map((r) => ({
          id: r.id, roundNumber: r.roundNumber, resultColor: r.resultColor,
          resultNumber: r.resultNumber, scheduledTime: r.scheduledTime, createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      console.error("Get game state error:", error);
      res.status(500).json({ error: "Failed to get game state" });
    }
  });

  app.post("/api/game/bet", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const data = insertBetSchema.parse(req.body);
      const state = await gameEngine.getState();

      if (state.phase !== "betting") {
        return res.status(400).json({ error: "Betting is closed. Wait for next scheduled game." });
      }

      if (data.betType === "color" && !data.betColor) {
        return res.status(400).json({ error: "Color is required for color bet" });
      }
      if (data.betType === "number" && (data.betNumber === undefined || data.betNumber === null)) {
        return res.status(400).json({ error: "Number is required for number bet" });
      }

      const minBet = parseInt(await storage.getSetting("min_bet") || "10");
      const maxBet = parseInt(await storage.getSetting("max_bet") || "10000");
      if (data.betAmount < minBet) return res.status(400).json({ error: `Minimum bet is ₹${minBet}` });
      if (data.betAmount > maxBet) return res.status(400).json({ error: `Maximum bet is ₹${maxBet}` });

      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      if (user.isBanned) return res.status(403).json({ error: "Account suspended" });
      if (user.balance < data.betAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      await storage.updateUserBalance(user.id, -data.betAmount);
      await storage.createTransaction(user.id, "bet", data.betAmount, "completed");

      const bet = await storage.createBet(
        user.id,
        state.currentRound,
        data.betType,
        data.betColor || null,
        data.betNumber !== undefined ? data.betNumber : null,
        data.betAmount
      );

      const updatedUser = await storage.getUser(user.id);

      // Broadcast live bet to admin watchers
      broadcastToAll({ type: "new_bet", bet: { ...bet, username: user.username }, roundId: state.currentRound });

      res.json({ bet, balance: updatedUser?.balance || 0 });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      console.error("Bet error:", error);
      res.status(500).json({ error: "Failed to place bet" });
    }
  });

  app.get("/api/game/live-bets", async (req: Request, res: Response) => {
    try {
      const stats = await gameEngine.getCurrentLiveBets();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get live bets" });
    }
  });

  // ===================== USER =====================
  app.get("/api/user/bets", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const userBets = await storage.getUserBets(req.session.userId, 50);
      res.json(userBets);
    } catch (error) {
      res.status(500).json({ error: "Failed to get bets" });
    }
  });

  app.get("/api/user/referrals", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const allUsers = await storage.getAllUsers();
      const referrals = allUsers.filter((u) => u.referredBy === user.id);
      res.json({ referralCode: user.referralCode, referralCount: referrals.length, referrals: referrals.map((u) => ({ username: u.username, createdAt: u.createdAt })) });
    } catch (error) {
      res.status(500).json({ error: "Failed to get referrals" });
    }
  });

  // ===================== WALLET =====================
  app.post("/api/wallet/add", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const { amount } = addMoneySchema.parse(req.body);

      // Try multi-UPI rotation first
      const upiAccount = await storage.getRandomActiveUpi();

      let upiId: string;
      let upiName: string;
      let upiQr: string = "";
      let upiAccountId: number | undefined;

      if (upiAccount) {
        upiId = upiAccount.upiId;
        upiName = upiAccount.upiName;
        upiQr = upiAccount.qrCode || "";
        upiAccountId = upiAccount.id;
      } else {
        // Fallback to settings
        upiId = await storage.getSetting("upi_id") || "admin@upi";
        upiName = await storage.getSetting("upi_name") || "3 Batti Game";
        upiQr = await storage.getSetting("upi_qr") || "";
      }

      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      res.json({
        upiId,
        upiName,
        upiQr,
        upiAccountId,
        amount,
        paymentId,
        qrData: `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&cu=INR&tn=${paymentId}`,
        apps: [
          { name: "PhonePe", deeplink: `phonepe://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
          { name: "Google Pay", deeplink: `gpay://upi/pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
          { name: "Paytm", deeplink: `paytmmp://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
          { name: "Other UPI", deeplink: `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
        ],
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      res.status(500).json({ error: "Failed to initiate payment" });
    }
  });

  app.post("/api/wallet/submit-deposit", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const data = submitDepositSchema.parse(req.body);
      const transaction = await storage.createTransaction(
        req.session.userId, "deposit", data.amount, "pending",
        data.paymentId, data.utrId, data.upiApp, "Awaiting admin verification", data.upiAccountId
      );
      res.json({ success: true, transaction, message: "Deposit request submitted. Admin will verify within 24 hours." });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
      res.status(500).json({ error: "Failed to submit deposit" });
    }
  });

  app.get("/api/wallet/transactions", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const txns = await storage.getUserTransactions(req.session.userId, 50);
      res.json(txns);
    } catch (error) {
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  app.post("/api/wallet/withdraw", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    try {
      const { amount, bankName, ifscCode, accountNumber, accountHolderName, upiId } = req.body;
      const minWithdraw = parseInt(await storage.getSetting("min_withdraw") || "100");
      if (!amount || amount < minWithdraw) {
        return res.status(400).json({ error: `Minimum withdrawal amount is ₹${minWithdraw}` });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      if (user.isBanned) return res.status(403).json({ error: "Account suspended" });

      if (bankName || ifscCode || accountNumber || accountHolderName) {
        await storage.updateUserBankDetails(user.id, { bankName, ifscCode, accountNumber, accountHolderName });
      }

      await storage.updateUserBalance(user.id, -amount);
      const note = upiId ? `UPI: ${upiId}` : (accountNumber ? `Bank: ${accountNumber}` : "");
      const transaction = await storage.createTransaction(user.id, "withdrawal", amount, "pending", undefined, undefined, undefined, note);

      res.json({ success: true, transaction, message: "Withdrawal request submitted. Processing within 24 hours." });
    } catch (error) {
      console.error("Withdraw error:", error);
      res.status(500).json({ error: "Failed to process withdrawal" });
    }
  });

  // ===================== LEADERBOARD =====================
  app.get("/api/leaderboard", async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const leaderboard = allUsers
        .filter((u) => !u.isAdmin && u.phone !== ADMIN_PHONE)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, username: u.username, balance: u.balance }));
      res.json(leaderboard);
    } catch (error) {
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  // ===================== PUBLIC UPI =====================
  app.get("/api/upi-settings", async (req: Request, res: Response) => {
    try {
      const upiId = await storage.getSetting("upi_id") || "";
      const upiName = await storage.getSetting("upi_name") || "3 Batti Game";
      res.json({ upiId, upiName });
    } catch (error) {
      res.status(500).json({ error: "Failed to get UPI settings" });
    }
  });

  // ===================== ADMIN =====================
  const requireAdmin = (req: Request, res: Response, next: any) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: "Admin access required" });
    next();
  };

  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { phone, password } = req.body;
      if (phone === ADMIN_PHONE && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.userId = -1;
        return res.json({ success: true, isAdmin: true });
      }
      return res.status(401).json({ error: "Invalid admin credentials" });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Dashboard stats
  app.get("/api/admin/dashboard", requireAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  // Users
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({
        id: u.id, username: u.username, phone: u.phone, balance: u.balance,
        isAdmin: u.isAdmin, isBanned: u.isBanned, referralCode: u.referralCode, createdAt: u.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.post("/api/admin/ban-user", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, banned } = req.body;
      const user = await storage.banUser(userId, !!banned);
      await storage.createAdminLog(req.session.userId, banned ? "ban_user" : "unban_user", `User ${user?.username}`, String(userId), "user");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  app.post("/api/admin/add-balance", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, amount } = req.body;
      if (!userId || typeof amount !== "number") return res.status(400).json({ error: "Invalid request" });
      const user = await storage.updateUserBalance(userId, amount);
      if (!user) return res.status(404).json({ error: "User not found" });
      await storage.createTransaction(userId, "admin_credit", amount, "completed", undefined, undefined, undefined, "Admin manual credit");
      await storage.createAdminLog(req.session.userId, "edit_balance", `Added ₹${amount} to user ${user.username}`, String(userId), "user");
      res.json({ success: true, newBalance: user.balance });
    } catch (error) {
      res.status(500).json({ error: "Failed to add balance" });
    }
  });

  // Game control
  app.post("/api/admin/set-result", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { color, number } = req.body;
      if (!["red", "yellow", "green"].includes(color)) {
        return res.status(400).json({ error: "Invalid color" });
      }
      await gameEngine.setNextResult(color, number !== undefined ? parseInt(number) : undefined);
      await storage.createAdminLog(req.session.userId, "set_result", `Set result: ${color} / #${number ?? "random"}`, undefined, "game");
      res.json({ success: true, message: `Next result set to ${color} / #${number ?? "random"}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to set result" });
    }
  });

  app.get("/api/admin/game-state", requireAdmin, async (req: Request, res: Response) => {
    try {
      const state = await gameEngine.getState();
      const liveBets = await gameEngine.getCurrentLiveBets();
      res.json({ state, liveBets });
    } catch (error) {
      res.status(500).json({ error: "Failed to get game state" });
    }
  });

  app.get("/api/admin/profit-analysis", requireAdmin, async (req: Request, res: Response) => {
    try {
      const analysis = await storage.getProfitAnalysis();
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ error: "Failed to get profit analysis" });
    }
  });

  // Transactions
  app.get("/api/admin/pending-transactions", requireAdmin, async (req: Request, res: Response) => {
    try {
      const pending = await storage.getPendingTransactions();
      res.json(pending);
    } catch (error) {
      res.status(500).json({ error: "Failed to get pending transactions" });
    }
  });

  app.get("/api/admin/all-transactions", requireAdmin, async (req: Request, res: Response) => {
    try {
      const txns = await storage.getAllTransactionsWithUser(200);
      res.json(txns);
    } catch (error) {
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  app.post("/api/admin/approve-deposit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.body;
      const txn = await storage.getTransaction(transactionId);
      if (!txn || txn.type !== "deposit" || txn.status !== "pending") {
        return res.status(400).json({ error: "Invalid or already processed transaction" });
      }
      await storage.updateTransactionStatus(transactionId, "completed", "Approved by admin");
      await storage.updateUserBalance(txn.userId, txn.amount);
      if (txn.upiAccountId) {
        await storage.incrementUpiReceived(txn.upiAccountId, txn.amount);
      }
      await storage.createAdminLog(req.session.userId, "approve_deposit", `Approved deposit ₹${txn.amount} UTR:${txn.utrId}`, String(transactionId), "transaction");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve deposit" });
    }
  });

  app.post("/api/admin/reject-transaction", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { transactionId, reason } = req.body;
      const txn = await storage.getTransaction(transactionId);
      if (!txn || txn.status !== "pending") {
        return res.status(400).json({ error: "Invalid or already processed transaction" });
      }
      if (txn.type === "withdrawal") {
        await storage.updateUserBalance(txn.userId, txn.amount);
      }
      await storage.updateTransactionStatus(transactionId, "rejected", reason || "Rejected by admin");
      await storage.createAdminLog(req.session.userId, "reject_transaction", `Rejected ${txn.type} ₹${txn.amount}: ${reason}`, String(transactionId), "transaction");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reject transaction" });
    }
  });

  app.post("/api/admin/approve-withdrawal", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.body;
      const txn = await storage.getTransaction(transactionId);
      if (!txn || txn.type !== "withdrawal" || txn.status !== "pending") {
        return res.status(400).json({ error: "Invalid or already processed transaction" });
      }
      await storage.updateTransactionStatus(transactionId, "completed", "Processed by admin");
      await storage.createAdminLog(req.session.userId, "approve_withdrawal", `Approved withdrawal ₹${txn.amount}`, String(transactionId), "transaction");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve withdrawal" });
    }
  });

  // UPI Accounts (Multi-UPI)
  app.get("/api/admin/upi-accounts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const accounts = await storage.getAllUpiAccounts();
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to get UPI accounts" });
    }
  });

  app.post("/api/admin/upi-accounts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { upiId, upiName, qrCode } = req.body;
      if (!upiId) return res.status(400).json({ error: "UPI ID is required" });
      const account = await storage.createUpiAccount(upiId, upiName || "3 Batti Game", qrCode);
      await storage.createAdminLog(req.session.userId, "add_upi", `Added UPI: ${upiId}`, String(account.id), "upi");
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Failed to add UPI account" });
    }
  });

  app.put("/api/admin/upi-accounts/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { upiId, upiName, qrCode, status } = req.body;
      const updates: any = {};
      if (upiId !== undefined) updates.upiId = upiId;
      if (upiName !== undefined) updates.upiName = upiName;
      if (qrCode !== undefined) updates.qrCode = qrCode;
      if (status !== undefined) updates.status = status;
      const account = await storage.updateUpiAccount(id, updates);
      await storage.createAdminLog(req.session.userId, "update_upi", `Updated UPI ${id}: ${JSON.stringify(updates)}`, String(id), "upi");
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Failed to update UPI account" });
    }
  });

  app.delete("/api/admin/upi-accounts/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteUpiAccount(id);
      await storage.createAdminLog(req.session.userId, "delete_upi", `Deleted UPI account ${id}`, String(id), "upi");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete UPI account" });
    }
  });

  // Legacy UPI settings (single)
  app.get("/api/admin/upi-settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const upiId = await storage.getSetting("upi_id") || "";
      const upiName = await storage.getSetting("upi_name") || "3 Batti Game";
      const upiQr = await storage.getSetting("upi_qr") || "";
      res.json({ upiId, upiName, upiQr });
    } catch (error) {
      res.status(500).json({ error: "Failed to get UPI settings" });
    }
  });

  app.post("/api/admin/upi-settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { upiId, upiName, upiQr } = req.body;
      if (upiId) await storage.setSetting("upi_id", upiId);
      if (upiName) await storage.setSetting("upi_name", upiName);
      if (upiQr !== undefined) await storage.setSetting("upi_qr", upiQr);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update UPI settings" });
    }
  });

  // Settings panel
  app.get("/api/admin/settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const all = await storage.getAllSettings();
      const map: Record<string, string> = {};
      for (const s of all) map[s.key] = s.value;
      res.json(map);
    } catch (error) {
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  app.post("/api/admin/settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allowed = ["min_bet", "max_bet", "referral_bonus", "commission_l1", "commission_l2", "gst_rate", "color_multiplier", "number_multiplier", "min_withdraw", "max_withdraw"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          await storage.setSetting(key, String(req.body[key]));
        }
      }
      await storage.createAdminLog(req.session.userId, "update_settings", `Updated settings: ${Object.keys(req.body).join(", ")}`, undefined, "settings");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Admin logs
  app.get("/api/admin/logs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAdminLogs(100);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get admin logs" });
    }
  });

  // Rounds
  app.get("/api/admin/rounds", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rounds = await storage.getRecentRounds(50);
      res.json(rounds);
    } catch (error) {
      res.status(500).json({ error: "Failed to get rounds" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    ws.on("error", (err) => console.error("WS error:", err));
    ws.send(JSON.stringify({ type: "connected", message: "Connected to 3 Batti live feed" }));
  });

  // Broadcast game state every second
  setInterval(async () => {
    try {
      if (!wss || wss.clients.size === 0) return;
      const state = await gameEngine.getState();
      broadcastToAll({ type: "game_state", phase: state.phase, countdown: state.countdown, currentRound: state.currentRound, lastResult: state.lastResult, lastResultNumber: state.lastResultNumber });
    } catch (_) {}
  }, 2000);

  return httpServer;
}
