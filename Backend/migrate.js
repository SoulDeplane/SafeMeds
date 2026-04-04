import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const db = new pg.Client({
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
});

async function runMigration() {
  try {
    await db.connect();
    console.log("Connected to database. Running migration...");

    // Add total_pills column safely
    await db.query(`
      ALTER TABLE prescriptions 
      ADD COLUMN IF NOT EXISTS total_pills INTEGER DEFAULT 0;
    `);

    console.log("Migration successful: Added total_pills column to prescriptions table.");

    await db.query(`
      ALTER TABLE adherence_logs 
      ADD COLUMN IF NOT EXISTS side_effects TEXT;
    `);

    // Drop and recreate the CHECK constraint for status
    await db.query(`
      ALTER TABLE adherence_logs DROP CONSTRAINT IF EXISTS adherence_logs_status_check;
    `);
    
    await db.query(`
      ALTER TABLE adherence_logs 
      ADD CONSTRAINT adherence_logs_status_check 
      CHECK (status IN ('taken', 'missed', 'skipped', 'delayed', 'logged'));
    `);

    console.log("Migration successful: Added side_effects to adherence_logs and updated status constraint.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await db.end();
  }
}

runMigration();
