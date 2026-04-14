import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
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
      if (referralCodeUsed) {
        const referrer = await storage.getUserByReferralCode(referralCodeUsed);
        if (referrer) referredBy = referrer.id;
      }

      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const user = await storage.createUser({ ...data, referralCode, referredBy });

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
          await storage.updateUserBalance(admin.id, 0);
        }
        req.session.userId = admin.id;
        req.session.isAdmin = true;
        return res.json({ id: admin.id, username: "Admin", phone: admin.phone, balance: admin.balance, isAdmin: true, referralCode: admin.referralCode });
      }

      const user = await storage.getUserByPhone(data.phone);
      if (!user || user.password !== data.password) {
        return res.status(401).json({ error: "Invalid phone or password" });
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

      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ error: "User not found" });
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
      const upiId = await storage.getSetting("upi_id") || "admin@upi";
      const upiName = await storage.getSetting("upi_name") || "3 Batti Game";
      const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      res.json({
        upiId,
        upiName,
        amount,
        paymentId,
        qrData: `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&cu=INR&tn=${paymentId}`,
        apps: [
          { name: "PhonePe", package: "com.phonepe.app", deeplink: `phonepe://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
          { name: "Google Pay", package: "com.google.android.apps.nbu.paisa.user", deeplink: `gpay://upi/pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
          { name: "Paytm", package: "net.one97.paytm", deeplink: `paytmmp://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
          { name: "Other UPI", package: "", deeplink: `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${paymentId}` },
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
        data.paymentId, data.utrId, data.upiApp, "Awaiting admin verification"
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
      if (!amount || amount < 100) {
        return res.status(400).json({ error: "Minimum withdrawal amount is ₹100" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

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

  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({
        id: u.id, username: u.username, phone: u.phone, balance: u.balance,
        isAdmin: u.isAdmin, referralCode: u.referralCode, createdAt: u.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.post("/api/admin/set-result", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { color, number } = req.body;
      if (!["red", "yellow", "green"].includes(color)) {
        return res.status(400).json({ error: "Invalid color" });
      }
      await gameEngine.setNextResult(color, number !== undefined ? parseInt(number) : undefined);
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

  app.post("/api/admin/add-balance", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, amount } = req.body;
      if (!userId || typeof amount !== "number") return res.status(400).json({ error: "Invalid request" });
      const user = await storage.updateUserBalance(userId, amount);
      if (!user) return res.status(404).json({ error: "User not found" });
      await storage.createTransaction(userId, "admin_credit", amount, "completed");
      res.json({ success: true, newBalance: user.balance });
    } catch (error) {
      res.status(500).json({ error: "Failed to add balance" });
    }
  });

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
      const txns = await storage.getAllTransactions(200);
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
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve withdrawal" });
    }
  });

  // UPI Settings
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

  app.get("/api/upi-settings", async (req: Request, res: Response) => {
    try {
      const upiId = await storage.getSetting("upi_id") || "";
      const upiName = await storage.getSetting("upi_name") || "3 Batti Game";
      res.json({ upiId, upiName });
    } catch (error) {
      res.status(500).json({ error: "Failed to get UPI settings" });
    }
  });

  app.get("/api/admin/rounds", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rounds = await storage.getRecentRounds(50);
      res.json(rounds);
    } catch (error) {
      res.status(500).json({ error: "Failed to get rounds" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
