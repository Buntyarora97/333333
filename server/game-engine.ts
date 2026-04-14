import { storage } from "./storage";

const COLORS = ["red", "yellow", "green"] as const;
const BETTING_DURATION = 300;
const RESULT_DISPLAY_DURATION = 15;
const COLOR_WIN_MULTIPLIER = 2.0;
const NUMBER_WIN_MULTIPLIER = 9.0;

// IST = UTC + 5:30 (offset in minutes: 330)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Scheduled game times in IST (hour, minute)
const GAME_TIMES = [
  { hour: 9, minute: 0, label: "09:00 AM" },
  { hour: 13, minute: 0, label: "01:00 PM" },
  { hour: 17, minute: 0, label: "05:00 PM" },
  { hour: 21, minute: 0, label: "09:00 PM" },
];

function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

function getNextScheduledTime(): { date: Date; label: string; secondsUntil: number } {
  const now = nowIST();
  const todayBase = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const gt of GAME_TIMES) {
    const scheduled = new Date(todayBase.getTime() + (gt.hour * 60 + gt.minute) * 60 * 1000);
    const diffMs = scheduled.getTime() - now.getTime();
    if (diffMs > 0) {
      return {
        date: scheduled,
        label: gt.label,
        secondsUntil: Math.ceil(diffMs / 1000),
      };
    }
  }

  // All today's games have passed, next is tomorrow 9 AM
  const tomorrow = new Date(todayBase.getTime() + 24 * 60 * 60 * 1000);
  const first = GAME_TIMES[0];
  const scheduled = new Date(tomorrow.getTime() + (first.hour * 60 + first.minute) * 60 * 1000);
  const diffMs = scheduled.getTime() - now.getTime();
  return {
    date: scheduled,
    label: first.label,
    secondsUntil: Math.ceil(diffMs / 1000),
  };
}

function isWithinBettingWindow(): boolean {
  const now = nowIST();
  const todayBase = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const gt of GAME_TIMES) {
    const scheduled = new Date(todayBase.getTime() + (gt.hour * 60 + gt.minute) * 60 * 1000);
    const diffMs = scheduled.getTime() - now.getTime();
    if (diffMs >= 0 && diffMs <= BETTING_DURATION * 1000) {
      return true;
    }
  }
  return false;
}

class GameEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    let state = await storage.getGameState();
    if (!state) {
      state = await storage.createGameState();
    }

    this.initialized = true;
    this.startGameLoop();
  }

  private startGameLoop() {
    this.intervalId = setInterval(async () => {
      await this.tick();
    }, 1000);
  }

  private async tick() {
    try {
      let state = await storage.getGameState();
      if (!state) {
        state = await storage.createGameState();
      }

      if (state.phase === "waiting") {
        // Check if any game time is now (within 5-minute betting window)
        if (isWithinBettingWindow()) {
          const next = getNextScheduledTime();
          // Find current game time
          const now = nowIST();
          const todayBase = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          let currentLabel = "";
          for (const gt of GAME_TIMES) {
            const scheduled = new Date(todayBase.getTime() + (gt.hour * 60 + gt.minute) * 60 * 1000);
            const diffMs = scheduled.getTime() - now.getTime();
            if (diffMs >= 0 && diffMs <= BETTING_DURATION * 1000) {
              currentLabel = gt.label;
              break;
            }
          }

          await storage.updateGameState({
            phase: "betting",
            countdown: BETTING_DURATION,
            nextScheduledTime: currentLabel,
          });
        } else {
          // Update countdown to next game
          const next = getNextScheduledTime();
          await storage.updateGameState({
            countdown: next.secondsUntil,
            nextScheduledTime: next.label,
          });
        }
      } else if (state.phase === "betting") {
        const newCountdown = state.countdown - 1;
        if (newCountdown <= 0) {
          // Compute result NOW so it's visible during the result phase
          const resultColor = state.nextResult || this.getRandomColor();
          const resultNumber = state.nextResultNumber !== null && state.nextResultNumber !== undefined
            ? state.nextResultNumber
            : this.getRandomNumber();

          await storage.updateGameState({
            phase: "result",
            countdown: RESULT_DISPLAY_DURATION,
            lastResult: resultColor,
            lastResultNumber: resultNumber,
          });
        } else {
          await storage.updateGameState({ countdown: newCountdown });
        }
      } else if (state.phase === "result") {
        const newCountdown = state.countdown - 1;
        if (newCountdown <= 0) {
          // Process bets using lastResult (revealed at start of result phase)
          const resultColor = state.lastResult || this.getRandomColor();
          const resultNumber = state.lastResultNumber !== null && state.lastResultNumber !== undefined
            ? state.lastResultNumber
            : this.getRandomNumber();

          const round = await storage.createGameRound(
            state.currentRound,
            resultColor,
            resultNumber,
            state.nextScheduledTime || ""
          );

          await this.processRoundResults(round.id, resultColor, resultNumber);

          const next = getNextScheduledTime();
          await storage.updateGameState({
            phase: "waiting",
            countdown: next.secondsUntil,
            currentRound: state.currentRound + 1,
            nextResult: null,
            nextResultNumber: null,
            nextScheduledTime: next.label,
          });
        } else {
          await storage.updateGameState({ countdown: newCountdown });
        }
      }
    } catch (error) {
      console.error("Game engine tick error:", error);
    }
  }

  private getRandomColor(): string {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  private getRandomNumber(): number {
    return Math.floor(Math.random() * 10);
  }

  private async processRoundResults(roundId: number, resultColor: string, resultNumber: number) {
    const bets = await storage.getBetsForRound(roundId);
    const GST_RATE = 0.18;
    const COMMISSION_RATE_L1 = 0.05;
    const COMMISSION_RATE_L2 = 0.025;

    for (const bet of bets) {
      let won = false;
      let winAmount = 0;

      if (bet.betType === "color") {
        won = bet.betColor === resultColor;
        if (won) {
          const gross = Math.floor(bet.betAmount * COLOR_WIN_MULTIPLIER);
          const profit = gross - bet.betAmount;
          const gst = Math.floor(profit * GST_RATE);
          winAmount = gross - gst;
        }
      } else if (bet.betType === "number") {
        won = bet.betNumber === resultNumber;
        if (won) {
          const gross = Math.floor(bet.betAmount * NUMBER_WIN_MULTIPLIER);
          const profit = gross - bet.betAmount;
          const gst = Math.floor(profit * GST_RATE);
          winAmount = gross - gst;
        }
      }

      await storage.updateBetResult(bet.id, won, winAmount);

      if (won && winAmount > 0) {
        await storage.updateUserBalance(bet.userId, winAmount);
        await storage.createTransaction(bet.userId, "win", winAmount, "completed");
      }

      // Referral Commissions
      const user = await storage.getUser(bet.userId);
      if (user && user.referredBy) {
        const l1Bonus = Math.floor(bet.betAmount * COMMISSION_RATE_L1);
        await storage.updateUserBalance(user.referredBy, l1Bonus);
        await storage.createTransaction(user.referredBy, "commission_l1", l1Bonus, "completed");

        const parent = await storage.getUser(user.referredBy);
        if (parent && parent.referredBy) {
          const l2Bonus = Math.floor(bet.betAmount * COMMISSION_RATE_L2);
          await storage.updateUserBalance(parent.referredBy, l2Bonus);
          await storage.createTransaction(parent.referredBy, "commission_l2", l2Bonus, "completed");
        }
      }
    }
  }

  async setNextResult(color: string, number?: number) {
    if (!COLORS.includes(color as any)) {
      throw new Error("Invalid color");
    }
    const updates: any = { nextResult: color };
    if (number !== undefined && number >= 0 && number <= 9) {
      updates.nextResultNumber = number;
    }
    await storage.updateGameState(updates);
  }

  async getState() {
    let state = await storage.getGameState();
    if (!state) {
      state = await storage.createGameState();
    }
    return state;
  }

  async getCurrentLiveBets() {
    return await storage.getLiveBetStats();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const gameEngine = new GameEngine();
