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

async function checkData() {
  await db.connect();
  console.log("--- Users ---");
  const users = await db.query("SELECT user_id, full_name, role FROM users;");
  console.table(users.rows);

  console.log("--- Adherence Logs ---");
  const logs = await db.query("SELECT * FROM adherence_logs;");
  console.table(logs.rows);

  await db.end();
}

checkData();
