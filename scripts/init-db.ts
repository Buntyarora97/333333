import pkg from "pg";
const { Client } = pkg;

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("No DB URL");

const client = new Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  await client.connect();
  console.log("Connected to database");

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      username TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by INTEGER,
      bank_name TEXT,
      ifsc_code TEXT,
      account_number TEXT,
      account_holder_name TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
  console.log("✓ users");

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_rounds (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      round_number INTEGER NOT NULL,
      result_color TEXT NOT NULL,
      result_number INTEGER NOT NULL DEFAULT 0,
      scheduled_time TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
  console.log("✓ game_rounds");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id INTEGER NOT NULL,
      round_id INTEGER NOT NULL,
      bet_type TEXT NOT NULL DEFAULT 'color',
      bet_color TEXT,
      bet_number INTEGER,
      bet_amount INTEGER NOT NULL,
      won BOOLEAN,
      win_amount INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
  console.log("✓ bets");

  await client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT,
      utr_id TEXT,
      reference_id TEXT,
      upi_app TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
  console.log("✓ transactions");

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      current_round INTEGER NOT NULL DEFAULT 1,
      phase TEXT NOT NULL DEFAULT 'waiting',
      countdown INTEGER NOT NULL DEFAULT 0,
      last_result TEXT,
      last_result_number INTEGER,
      next_result TEXT,
      next_result_number INTEGER,
      next_scheduled_time TEXT,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
  console.log("✓ game_state");

  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
  console.log("✓ settings");

  await client.end();
  console.log("Database initialized successfully!");
}

main().catch((e) => { console.error(e); process.exit(1); });
