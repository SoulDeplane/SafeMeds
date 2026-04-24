import pg from "pg";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import twilio from "twilio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
app.use(cors());
// Raise payload limit — OCR/PDF uploads arrive as base64 strings and routinely
// exceed the 100 KB body-parser default (a 3 MB photo is ~4 MB once base64-encoded).
app.use(bodyParser.json({ limit: "25mb" }));
app.use(bodyParser.urlencoded({ limit: "25mb", extended: true }));
app.use(express.static("../Frontend"));
dotenv.config();

// Gemini 1.5 Flash replaces Google Cloud Vision for OCR. Client is lazy-inited
// so the server still boots when the key is missing (same pattern as Twilio).
let geminiModel = null;
function getGeminiModel() {
  if (geminiModel) return geminiModel;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const client = new GoogleGenerativeAI(key);
  // gemini-2.5-flash is the current stable multimodal Flash model on the
  // v1beta endpoint; the 1.5 alias was retired.
  geminiModel = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  return geminiModel;
}

async function extractTextWithGemini(base64Data, mimeType) {
  const model = getGeminiModel();
  if (!model) {
    const err = new Error("GEMINI_API_KEY missing from .env");
    err.code = "NO_API_KEY";
    throw err;
  }
  const prompt =
    "Transcribe all visible text from this document exactly as it appears. " +
    "Preserve line breaks and ordering. Output only the raw text — no commentary, " +
    "no Markdown, no explanations.";
  const parts = [prompt, { inlineData: { data: base64Data, mimeType } }];

  // Gemini Flash occasionally returns 503 "model overloaded" under spikes.
  // Retry transiently with backoff; bubble up anything else.
  const delays = [1500, 4000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const result = await model.generateContent(parts);
      return result.response.text() || "";
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || "");
      const overloaded = msg.includes("503") || /overload|unavailable/i.test(msg);
      if (!overloaded || attempt === delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

const db = new pg.Client({
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
});

async function runMigrations() {
  try {
    console.log("Running database migrations...");
    await db.query(`
      ALTER TABLE prescriptions 
      ADD COLUMN IF NOT EXISTS total_pills INTEGER DEFAULT 0;
    `);

    await db.query(`
      ALTER TABLE adherence_logs 
      ADD COLUMN IF NOT EXISTS side_effects TEXT;
    `);

    await db.query(`
      ALTER TABLE adherence_logs 
      ADD COLUMN IF NOT EXISTS medication_id UUID;
    `);

    await db.query(`
      UPDATE adherence_logs a
      SET medication_id = p.medication_id
      FROM prescriptions p
      WHERE a.prescription_id = p.prescription_id
      AND a.medication_id IS NULL;
    `);

    await db.query(`
      ALTER TABLE adherence_logs DROP CONSTRAINT IF EXISTS adherence_logs_status_check;
    `);
    
    await db.query(`
      ALTER TABLE adherence_logs 
      ADD CONSTRAINT adherence_logs_status_check 
      CHECK (status IN ('taken', 'missed', 'skipped', 'delayed', 'logged'));
    `);

    const activeUserRes = await db.query(`
      SELECT user_id FROM users 
      WHERE role = 'patient' 
      ORDER BY created_at DESC LIMIT 1
    `);
    if (activeUserRes.rows.length > 0) {
      const activeId = activeUserRes.rows[0].user_id;
      await db.query(`
        UPDATE adherence_logs 
        SET patient_id = $1 
        WHERE patient_id != $1
      `, [activeId]);
      
      await db.query(`
        DELETE FROM users 
        WHERE role = 'patient' AND user_id != $1
      `, [activeId]);
    }

    console.log("Migrations successful.");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

async function connectToDatabase() {
  try {
    await db.connect();
    console.log("Database connection successful");
<<<<<<< HEAD
    // Add is_paused column if it doesn't exist
    await db.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;`);

    // Preserve adherence history even after a prescription is deleted:
    //   1. Relax adherence_logs.prescription_id so it can be NULL.
    //   2. Swap ON DELETE CASCADE for ON DELETE SET NULL on the FK.
    //   3. Keep a medication_name snapshot on the log row so history stays
    //      self-contained when the original prescription/medication is gone.
    await db.query(`ALTER TABLE adherence_logs ALTER COLUMN prescription_id DROP NOT NULL;`);
    await db.query(`ALTER TABLE adherence_logs ADD COLUMN IF NOT EXISTS medication_name TEXT;`);
    await db.query(`ALTER TABLE adherence_logs ADD COLUMN IF NOT EXISTS dosage TEXT;`);
    await db.query(`ALTER TABLE adherence_logs ADD COLUMN IF NOT EXISTS route TEXT;`);
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conrelid = 'adherence_logs'::regclass
             AND conname = 'adherence_logs_prescription_id_fkey'
        ) THEN
          ALTER TABLE adherence_logs DROP CONSTRAINT adherence_logs_prescription_id_fkey;
        END IF;
        ALTER TABLE adherence_logs
          ADD CONSTRAINT adherence_logs_prescription_id_fkey
          FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id) ON DELETE SET NULL;
      END $$;
    `);
    // Backfill medication_name/dosage/route on any existing rows that still
    // have their prescription + medication available.
    await db.query(`
      UPDATE adherence_logs a
         SET medication_name = COALESCE(a.medication_name, m.medication_name),
             dosage          = COALESCE(a.dosage, p.dosage),
             route           = COALESCE(a.route, m.dosage_form)
        FROM prescriptions p
        LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE a.prescription_id = p.prescription_id
         AND (a.medication_name IS NULL OR a.dosage IS NULL OR a.route IS NULL);
    `);

    await reconcilePhantomPatients();
=======
    await runMigrations();
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
  } catch (error) {
    console.log("Database connection error:", error);
  }
}
<<<<<<< HEAD

// One-shot data repair: earlier builds of the edit flow called
// getOrCreateUser(name, 'patient') without a phone, which generated a
// phantom user with email '<name>_nophone_patient@safemeds.local' and
// phone_number = 'nophone'. Prescriptions created during editing got
// attached to that phantom instead of the real patient, so after re-login
// the real user's loadServerData finds nothing. This reattaches every
// phantom-owned prescription + adherence log to the real user with the
// same full_name, then removes the phantom row. Idempotent — safe to
// run on every startup.
async function reconcilePhantomPatients() {
  try {
    const phantoms = await db.query(
      `SELECT user_id, full_name
         FROM users
        WHERE role = 'patient'
          AND (email LIKE '%\\_nophone\\_patient@safemeds.local' ESCAPE '\\'
               OR phone_number = 'nophone')`
    );
    for (const ph of phantoms.rows) {
      const real = await db.query(
        `SELECT user_id FROM users
          WHERE role = 'patient'
            AND full_name = $1
            AND user_id <> $2
            AND (phone_number IS NOT NULL AND phone_number <> 'nophone')
          ORDER BY created_at ASC
          LIMIT 1`,
        [ph.full_name, ph.user_id]
      );
      if (real.rows.length === 0) {
        console.log(`[reconcile] Keeping phantom '${ph.full_name}' (${ph.user_id}) — no real counterpart`);
        continue;
      }
      const realId = real.rows[0].user_id;
      const movedRx = await db.query(
        `UPDATE prescriptions SET patient_id = $1 WHERE patient_id = $2 RETURNING prescription_id`,
        [realId, ph.user_id]
      );
      const movedLogs = await db.query(
        `UPDATE adherence_logs SET patient_id = $1 WHERE patient_id = $2 RETURNING log_id`,
        [realId, ph.user_id]
      );
      const movedReminders = await db.query(
        `UPDATE reminders SET patient_id = $1 WHERE patient_id = $2 RETURNING reminder_id`,
        [realId, ph.user_id]
      );
      await db.query(`DELETE FROM users WHERE user_id = $1`, [ph.user_id]);
      console.log(`[reconcile] '${ph.full_name}': moved ${movedRx.rowCount} Rx, ${movedLogs.rowCount} logs, ${movedReminders.rowCount} reminders from phantom ${ph.user_id} to real ${realId}`);
    }

    // Clear the literal 'nophone' string on any remaining rows (older doctor records).
    const cleaned = await db.query(
      `UPDATE users SET phone_number = NULL WHERE phone_number = 'nophone' RETURNING user_id`
    );
    if (cleaned.rowCount > 0) {
      console.log(`[reconcile] Cleared 'nophone' string on ${cleaned.rowCount} rows`);
    }
  } catch (err) {
    console.error("[reconcile] Repair failed:", err);
  }
}

connectToDatabase().then(startReminderDispatcher);
=======
connectToDatabase().then(() => {
});

app.post("/api/extract", (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: "No text to extract" });

        const apiPath = path.resolve(__dirname, "../clinical_extraction/api.py");
        const pyProcess = spawn("python", [apiPath], { shell: true });

        let outputData = "";
        let errorData = "";

        pyProcess.on("error", (err) => {
            console.error("Spawn Error:", err);
            if (!res.headersSent) res.status(500).json({ success: false, error: "Failed to spawn python" });
        });

        pyProcess.stdout.on("data", (data) => {
            outputData += data.toString();
        });

        pyProcess.stderr.on("data", (data) => {
            errorData += data.toString();
        });

        pyProcess.on("close", (code) => {
            if (code !== 0) {
                console.error("Python Subprocess Failed:", errorData);
                return res.status(500).json({ success: false, error: "Clinical extraction python process failed" });
            }
            try {
                const responseData = JSON.parse(outputData);
                res.json({ success: true, data: responseData });
            } catch(e) {
                console.error("Python IPC JSON Array Parse Error:", e, outputData);
                res.status(500).json({ success: false, error: "Python returned unparseable syntax data" });
            }
        });

        pyProcess.stdin.write(text);
        pyProcess.stdin.end();

    } catch(err) {
        console.error("Extraction routing root error:", err);
        res.status(500).json({ success: false, error: "Fatal router level processing fail" });
    }
});

app.get("/api/medications", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM medications ORDER BY created_at DESC",
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/medications", async (req, res) => {
  try {
    const { medication_name, dosage_form, strength } = req.body;

    if (!medication_name || !dosage_form) {
      return res.status(400).json({
        success: false,
        error: "medication_name and dosage_form are required",
      });
    }

    const result = await db.query(
      `INSERT INTO medications (medication_name, dosage_form, strength) 
             VALUES ($1, $2, $3) 
             RETURNING *`,
      [medication_name, dosage_form, strength],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/medications/:id", async (req, res) => {
  const { id } = req.params;
  const { medication_name, dosage_form, strength } = req.body;
  try {
    const result = await db.query(
      `UPDATE medications 
       SET medication_name = COALESCE($1, medication_name),
           dosage_form = COALESCE($2, dosage_form),
           strength = COALESCE($3, strength)
       WHERE medication_id = $4
       RETURNING *`,
      [medication_name, dosage_form, strength, id],
    );

    if (result.rows.length == 0) {
      return res.status(404).json({
        success: false,
        error: "No medication found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/medications/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM medications WHERE medication_id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Medication not found",
      });
    }

    res.json({
      success: true,
      message: "Medication deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at FROM users ORDER BY created_at DESC",
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at FROM users WHERE user_id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { email, full_name, phone_number, date_of_birth, role } = req.body;

    if (!email || !full_name || !role) {
      return res.status(400).json({
        success: false,
        error: "email, full_name, and role are required",
      });
    }

    const validRoles = ["patient", "doctor", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: "role must be 'patient', 'doctor', or 'admin'",
      });
    }

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone_number, date_of_birth, role) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at`,
      [email, "no_password", full_name, phone_number, date_of_birth, role],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, phone_number, date_of_birth, role, is_active } =
      req.body;

    if (role) {
      const validRoles = ["patient", "doctor", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: "role must be 'patient', 'doctor', or 'admin'",
        });
      }
    }

    const result = await db.query(
      `UPDATE users 
       SET email = COALESCE($1, email),
           full_name = COALESCE($2, full_name),
           phone_number = COALESCE($3, phone_number),
           date_of_birth = COALESCE($4, date_of_birth),
           role = COALESCE($5, role),
           is_active = COALESCE($6, is_active)
       WHERE user_id = $7
       RETURNING user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at`,
      [email, full_name, phone_number, date_of_birth, role, is_active, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM users WHERE user_id = $1 RETURNING user_id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/prescriptions", async (req, res) => {
  try {
    const { patientId } = req.query;
    let query = `SELECT p.*, 
              u.full_name as patient_name,
              d.full_name as doctor_name,
              m.medication_name,
              m.dosage_form,
              m.strength
       FROM prescriptions p
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN users d ON p.doctor_id = d.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id`;
    
    let params = [];
    if (patientId) {
        query += ` WHERE p.patient_id = $1`;
        params.push(patientId);
    }
    
    query += ` ORDER BY p.created_at DESC`;

    const result = await db.query(query, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/prescriptions", async (req, res) => {
  try {
    const {
      patient_id,
      doctor_id,
      medication_id,
      dosage,
      frequency,
      start_date,
      end_date,
      instructions,
      total_pills,
    } = req.body;

    const result = await db.query(
      `INSERT INTO prescriptions 
       (patient_id, doctor_id, medication_id, dosage, frequency, start_date, end_date, instructions, total_pills) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        patient_id,
        doctor_id,
        medication_id,
        dosage,
        frequency,
        start_date,
        end_date,
        instructions,
        total_pills || 0,
      ],
    );
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/prescriptions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { dosage, frequency, start_date, end_date, instructions, is_active, total_pills } =
      req.body;

    const result = await db.query(
      `UPDATE prescriptions 
       SET dosage = COALESCE($1, dosage),
           frequency = COALESCE($2, frequency),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date),
           instructions = COALESCE($5, instructions),
           is_active = COALESCE($6, is_active),
           total_pills = COALESCE($7, total_pills)
       WHERE prescription_id = $8
       RETURNING *`,
      [dosage, frequency, start_date, end_date, instructions, is_active, total_pills, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Prescription not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/prescriptions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `
      DELETE FROM prescriptions WHERE prescription_id = $1 RETURNING prescription_id
    `,
      [id],
    );
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/prescriptions/:id/take", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `UPDATE prescriptions 
       SET total_pills = GREATEST(0, total_pills - 1)
       WHERE prescription_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Prescription not found" });
    }

    try {
        const pId = result.rows[0].patient_id;
        const mId = result.rows[0].medication_id;
        await db.query(`
            INSERT INTO adherence_logs (patient_id, prescription_id, medication_id, scheduled_time, actual_time, status)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'taken')
        `, [pId, id, mId]);
    } catch(err) {
        console.error("Adherence Log failed: ", err);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/prescriptions/:id/skip", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const pRes = await db.query('SELECT patient_id, medication_id FROM prescriptions WHERE prescription_id = $1', [id]);
    if(pRes.rows.length === 0) return res.status(404).json({ success: false, error: "Prescription not found" });
    const pId = pRes.rows[0].patient_id;
    const mId = pRes.rows[0].medication_id;

    const result = await db.query(`
        INSERT INTO adherence_logs (patient_id, prescription_id, medication_id, scheduled_time, actual_time, status, notes)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'skipped', $4)
        RETURNING *
    `, [pId, id, mId, reason]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/prescriptions/:id/side_effect", async (req, res) => {
  try {
    const { id } = req.params;
    const { symptoms } = req.body;
    
    const pRes = await db.query('SELECT patient_id FROM prescriptions WHERE prescription_id = $1', [id]);
    if(pRes.rows.length === 0) return res.status(404).json({ success: false, error: "Prescription not found" });
    const pId = pRes.rows[0].patient_id;

    const existing = await db.query(`
       SELECT log_id FROM adherence_logs 
       WHERE prescription_id = $1 AND DATE(actual_time) = CURRENT_DATE
       ORDER BY actual_time DESC LIMIT 1
    `, [id]);

    let result;
    if(existing.rows.length > 0) {
        result = await db.query(`
           UPDATE adherence_logs SET side_effects = $1 WHERE log_id = $2 RETURNING *
        `, [symptoms, existing.rows[0].log_id]);
    } else {
        const pRes = await db.query('SELECT patient_id, medication_id FROM prescriptions WHERE prescription_id = $1', [id]);
        if(pRes.rows.length === 0) return res.status(404).json({ success: false, error: "Prescription not found" });
        const pId = pRes.rows[0].patient_id;
        const mId = pRes.rows[0].medication_id;

        result = await db.query(`
            INSERT INTO adherence_logs (patient_id, prescription_id, medication_id, scheduled_time, actual_time, status, side_effects)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'logged', $4)
            RETURNING *
        `, [pId, id, mId, symptoms]);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/history/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    const result = await db.query(`
       SELECT 
         a.log_id, a.actual_time, a.status, a.notes, a.side_effects,
         m.medication_name, p.dosage, m.dosage_form as route
       FROM adherence_logs a
       LEFT JOIN medications m ON a.medication_id = m.medication_id
       LEFT JOIN prescriptions p ON a.prescription_id = p.prescription_id
       WHERE a.patient_id = $1
       ORDER BY a.actual_time DESC
    `, [patientId]);
    
    const grouped = {};
    for(let row of result.rows) {
        const d = new Date(row.actual_time);
        const dateKey = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const timeKey = d.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' });
        
        if(!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({
            time: timeKey,
            medication: row.medication_name,
            dosage: row.dosage || '-',
            route: row.route || '-',
            status: row.status,
            reason: row.notes || '-',
            notes: row.side_effects || '-'
        });
    }

    res.json({ success: true, data: grouped });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/history/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    await db.query(`DELETE FROM adherence_logs WHERE patient_id = $1`, [patientId]);
    res.json({ success: true, message: "History cleared successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/schedules", async (req, res) => {
  try {
    const { prescription_id, time_of_day, dosage_amount } = req.body;

    if (!prescription_id || !time_of_day || !dosage_amount) {
      return res.status(400).json({
        success: false,
        error: "prescription_id, time_of_day, and dosage_amount are required",
      });
    }

    const result = await db.query(
      `INSERT INTO medication_schedules 
       (prescription_id, time_of_day, dosage_amount, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [prescription_id, time_of_day, dosage_amount],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/schedules/prescription/:prescription_id", async (req, res) => {
  try {
    const { prescription_id } = req.params;

    const result = await db.query(
      `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         u.full_name as patient_name,
         m.medication_name,
         m.dosage_form,
         m.strength
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE ms.prescription_id = $1
       ORDER BY ms.time_of_day ASC`,
      [prescription_id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         p.instructions,
         u.full_name as patient_name,
         m.medication_name,
         m.dosage_form,
         m.strength
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE ms.schedule_id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/schedules", async (req, res) => {
  try {
    const { patientId } = req.query;
    let query = `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         u.full_name as patient_name,
         m.medication_name
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id`;
    
    let params = [];
    if (patientId) {
        query += ` WHERE p.patient_id = $1`;
        params.push(patientId);
    }

    query += ` ORDER BY ms.time_of_day ASC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { time_of_day, dosage_amount, is_active } = req.body;

    const result = await db.query(
      `UPDATE medication_schedules
       SET time_of_day = COALESCE($1, time_of_day),
           dosage_amount = COALESCE($2, dosage_amount),
           is_active = COALESCE($3, is_active)
       WHERE schedule_id = $4
       RETURNING *`,
      [time_of_day, dosage_amount, is_active, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM medication_schedules WHERE schedule_id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    res.json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e

const VALID_REMINDER_TYPES = ["push", "sms", "email", "in_app"];
const VALID_REMINDER_STATUSES = ["pending", "sent", "failed", "dismissed"];

const normalizeReminderType = (value) => {
  if (!value) return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "notification") return "in_app";
  if (VALID_REMINDER_TYPES.includes(normalized)) return normalized;
  return value;
};

const normalizeReminderStatus = (value) => {
  if (!value) return value;
  return String(value).trim().toLowerCase();
};

const dispatchDueReminders = async () => {
  const result = await db.query(
    `SELECT
        r.*,
        u.full_name AS patient_name,
        u.email AS patient_email,
        u.phone_number,
        ms.time_of_day,
        ms.dosage_amount,
        p.frequency,
        p.instructions,
        m.medication_name
      FROM reminders r
      LEFT JOIN users u ON r.patient_id = u.user_id
      LEFT JOIN medication_schedules ms ON r.schedule_id = ms.schedule_id
      LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
      LEFT JOIN medications m ON p.medication_id = m.medication_id
      WHERE r.status = 'pending'
        AND r.reminder_time <= NOW()
        AND (p.is_paused IS FALSE OR p.is_paused IS NULL)
      ORDER BY r.reminder_time ASC`,
  );

  if (result.rows.length === 0) {
    return { total: 0, sent: [], failed: [] };
  }

  const sentReminders = [];
  const failedReminders = [];

  for (const reminder of result.rows) {
    const reminderType = normalizeReminderType(reminder.reminder_type);
    let nextStatus = "sent";
    let failureReason = "";

    if (!VALID_REMINDER_TYPES.includes(reminderType)) {
      nextStatus = "failed";
      failureReason = `invalid reminder type '${reminder.reminder_type}'`;
    } else if (reminderType === "email" && !reminder.patient_email) {
      nextStatus = "failed";
      failureReason = "patient email is missing";
    } else if (reminderType === "sms" && !reminder.phone_number) {
      nextStatus = "failed";
      failureReason = "patient phone number is missing";
    }

    const message =
      `Reminder for ${reminder.patient_name || reminder.patient_id}: ${reminder.medication_name || "medication"} ${reminder.dosage_amount || ""} ${reminder.frequency || ""}`
        .replace(/\s+/g, " ")
        .trim();

    if (nextStatus === "sent") {
      await db.query(
        `UPDATE reminders
         SET status = 'sent',
             sent_at = CURRENT_TIMESTAMP
         WHERE reminder_id = $1`,
        [reminder.reminder_id],
      );
      sentReminders.push({
        reminder_id: reminder.reminder_id,
        patient_name: reminder.patient_name,
        reminder_type: reminderType,
        reminder_time: reminder.reminder_time,
        message,
      });
    } else {
      await db.query(
        `UPDATE reminders
         SET status = 'failed'
         WHERE reminder_id = $1`,
        [reminder.reminder_id],
      );
      failedReminders.push({
        reminder_id: reminder.reminder_id,
        patient_name: reminder.patient_name,
        reminder_type: reminderType,
        reminder_time: reminder.reminder_time,
        reason: failureReason,
      });
    }
  }

  return {
    total: result.rows.length,
    sent: sentReminders,
    failed: failedReminders,
  };
};

async function startReminderDispatcher() {
  const intervalMs = Number(process.env.REMINDER_CHECK_INTERVAL_MS) || 60000;

  const runDispatcher = async () => {
    try {
      await dispatchDueReminders();
    } catch (error) {
      console.error(
        "[Reminder Dispatcher] Error while dispatching reminders:",
        error,
      );
    }
  };

  runDispatcher();
  setInterval(runDispatcher, intervalMs);
}

<<<<<<< HEAD
// API for Intelligent Extraction deeply interconnected to python module
app.post("/api/extract", (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: "No text to extract" });

        const apiPath = path.resolve(__dirname, "../clinical_extraction/api.py");
        const pyProcess = spawn("python", [apiPath], { shell: true });

        let outputData = "";
        let errorData = "";

        pyProcess.on("error", (err) => {
            console.error("Spawn Error:", err);
            if (!res.headersSent) res.status(500).json({ success: false, error: "Failed to spawn python" });
        });

        pyProcess.stdout.on("data", (data) => {
            outputData += data.toString();
        });

        pyProcess.stderr.on("data", (data) => {
            errorData += data.toString();
        });

        pyProcess.on("close", (code) => {
            if (code !== 0) {
                console.error("Python Subprocess Failed:", errorData);
                return res.status(500).json({ success: false, error: "Clinical extraction python process failed" });
            }
            try {
                const responseData = JSON.parse(outputData);
                res.json({ success: true, data: responseData });
            } catch(e) {
                console.error("Python IPC JSON Array Parse Error:", e, outputData);
                res.status(500).json({ success: false, error: "Python returned unparseable syntax data" });
            }
        });

        // Inject the payload securely via pipe
        pyProcess.stdin.write(text);
        pyProcess.stdin.end();

    } catch(err) {
        console.error("Extraction routing root error:", err);
        res.status(500).json({ success: false, error: "Fatal router level processing fail" });
    }
});

// API for Medications
app.get("/api/medications", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM medications ORDER BY created_at DESC",
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/medications", async (req, res) => {
  try {
    const { medication_name, dosage_form, strength } = req.body;

    // Validation
    if (!medication_name || !dosage_form) {
      return res.status(400).json({
        success: false,
        error: "medication_name and dosage_form are required",
      });
    }

    const result = await db.query(
      `INSERT INTO medications (medication_name, dosage_form, strength) 
             VALUES ($1, $2, $3) 
             RETURNING *`,
      [medication_name, dosage_form, strength],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/medications/:id", async (req, res) => {
  const { id } = req.params;
  const { medication_name, dosage_form, strength } = req.body;
  try {
    const result = await db.query(
      `UPDATE medications 
       SET medication_name = COALESCE($1, medication_name),
           dosage_form = COALESCE($2, dosage_form),
           strength = COALESCE($3, strength)
       WHERE medication_id = $4
       RETURNING *`,
      [medication_name, dosage_form, strength, id],
    );

    if (result.rows.length == 0) {
      return res.status(404).json({
        success: false,
        error: "No medication found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/medications/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM medications WHERE medication_id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Medication not found",
      });
    }

    res.json({
      success: true,
      message: "Medication deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API FOR users
// 1. GET all users
app.get("/api/users", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at FROM users ORDER BY created_at DESC",
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 2. GET single user by ID
app.get("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at FROM users WHERE user_id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
    // console.log(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 3. POST - Create new user
app.post("/api/users", async (req, res) => {
  try {
    const { email, full_name, phone_number, date_of_birth, role } = req.body;

    // Validation
    if (!email || !full_name || !role) {
      return res.status(400).json({
        success: false,
        error: "email, full_name, and role are required",
      });
    }

    // Validate role
    const validRoles = ["patient", "doctor", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: "role must be 'patient', 'doctor', or 'admin'",
      });
    }

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone_number, date_of_birth, role) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at`,
      [email, "no_password", full_name, phone_number, date_of_birth, role],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    // Handle unique constraint violation (duplicate email)
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Check if user exists by name and phone (profiles keyed by {Name, Phone})
app.get("/api/users/check", async (req, res) => {
  try {
    const { name, phone } = req.query;
    const digits = String(phone || "").replace(/\D/g, "").slice(-10);
    const result = await db.query(
      `SELECT user_id, full_name, phone_number, email
         FROM users
        WHERE full_name = $1
          AND regexp_replace(COALESCE(phone_number,''), '\\D', '', 'g') LIKE '%' || $2
          AND role = 'patient'
        LIMIT 1`,
      [name, digits],
    );
    const exists = result.rows.length > 0;
    res.json({
      success: true,
      exists,
      user: exists ? result.rows[0] : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. PUT - Update user
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, phone_number, date_of_birth, role, is_active } =
      req.body;

    // Validate role if provided
    if (role) {
      const validRoles = ["patient", "doctor", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: "role must be 'patient', 'doctor', or 'admin'",
        });
      }
    }

    const result = await db.query(
      `UPDATE users 
       SET email = COALESCE($1, email),
           full_name = COALESCE($2, full_name),
           phone_number = COALESCE($3, phone_number),
           date_of_birth = COALESCE($4, date_of_birth),
           role = COALESCE($5, role),
           is_active = COALESCE($6, is_active)
       WHERE user_id = $7
       RETURNING user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at`,
      [email, full_name, phone_number, date_of_birth, role, is_active, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 5. DELETE user
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM users WHERE user_id = $1 RETURNING user_id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API for Prescriptions
app.get("/api/prescriptions", async (req, res) => {
  try {
    const { patientId } = req.query;
    let query = `SELECT p.*, 
              u.full_name as patient_name,
              d.full_name as doctor_name,
              m.medication_name,
              m.dosage_form,
              m.strength
       FROM prescriptions p
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN users d ON p.doctor_id = d.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id`;
    
    let params = [];
    if (patientId) {
        query += ` WHERE p.patient_id = $1`;
        params.push(patientId);
    }
    
    query += ` ORDER BY p.created_at DESC`;

    const result = await db.query(query, params);
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/schedules/prescription/:prescription_id", async (req, res) => {
  try {
    const { prescription_id } = req.params;

    const result = await db.query(
      `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         u.full_name as patient_name,
         m.medication_name,
         m.dosage_form,
         m.strength
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE ms.prescription_id = $1
       ORDER BY ms.time_of_day ASC`,
      [prescription_id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/prescriptions", async (req, res) => {
  try {
    const {
      patient_id,
      doctor_id,
      medication_id,
      dosage,
      frequency,
      start_date,
      end_date,
      instructions,
      total_pills,
    } = req.body;

    const result = await db.query(
      `INSERT INTO prescriptions 
       (patient_id, doctor_id, medication_id, dosage, frequency, start_date, end_date, instructions, total_pills) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        patient_id,
        doctor_id,
        medication_id,
        dosage,
        frequency,
        start_date,
        end_date,
        instructions,
        total_pills || 0,
      ],
    );
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/prescriptions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { medication_id, dosage, frequency, start_date, end_date, instructions, is_active, total_pills, is_paused } =
      req.body;

    const fields = {
      medication_id, dosage, frequency, start_date, end_date, instructions, is_active, total_pills, is_paused
    };
    
    const updates = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    params.push(id);
    const query = `UPDATE prescriptions SET ${updates.join(", ")} WHERE prescription_id = $${paramIndex} RETURNING *`;
    
    console.log(`Executing Update: ${query} with params:`, params);
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Prescription not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      // ✅ Also send proper error response
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/prescriptions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `
      DELETE FROM prescriptions WHERE prescription_id = $1 RETURNING prescription_id
    `,
      [id],
    );
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// PUT - Take Medication (Decrement pill counter and log adherence)
app.put("/api/prescriptions/:id/take", async (req, res) => {
  try {
    const { id } = req.params;
    const { schedule_id, scheduled_time } = req.body;

    const result = await db.query(
      `UPDATE prescriptions
       SET total_pills = GREATEST(0, total_pills - 1)
       WHERE prescription_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Prescription not found" });
    }

    const updated = result.rows[0];
    const pId = updated.patient_id;

    // Snapshot medication info so history survives a future prescription delete.
    let snapName = null, snapDosage = updated.dosage || null, snapRoute = null;
    try {
      const snap = await db.query(
        `SELECT m.medication_name, m.dosage_form
           FROM medications m WHERE m.medication_id = $1`,
        [updated.medication_id]
      );
      if (snap.rows[0]) {
        snapName = snap.rows[0].medication_name;
        snapRoute = snap.rows[0].dosage_form;
      }
    } catch (_) {}

    try {
        await db.query(`
            INSERT INTO adherence_logs (patient_id, prescription_id, schedule_id, scheduled_time, actual_time, status, medication_name, dosage, route)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'taken', $5, $6, $7)
        `, [pId, id, schedule_id || null, scheduled_time || new Date().toISOString(), snapName, snapDosage, snapRoute]);
    } catch(err) {
        console.error("Adherence Log failed: ", err);
    }

    // Refill check: when pills drop to 3 or below, notify the user immediately
    const refillNeeded = updated.total_pills <= 3;
    let refillSms = null;
    let medicationName = null;
    if (refillNeeded) {
      try {
        const meta = await db.query(
          `SELECT u.phone_number, m.medication_name
             FROM prescriptions p
             LEFT JOIN users u ON p.patient_id = u.user_id
             LEFT JOIN medications m ON p.medication_id = m.medication_id
            WHERE p.prescription_id = $1`,
          [id]
        );
        const row = meta.rows[0] || {};
        medicationName = row.medication_name || "your medication";
        if (row.phone_number) {
          const msg = `SafeMeds: Only ${updated.total_pills} pill(s) left of ${medicationName}. Please refill soon.`;
          refillSms = await sendSms(row.phone_number, msg);
        }
      } catch (err) {
        console.error("Refill notify failed:", err);
      }
    }

    res.json({
      success: true,
      data: updated,
      refill_needed: refillNeeded,
      medication_name: medicationName,
      refill_sms: refillSms,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Skip Medication (Log adherence)
app.put("/api/prescriptions/:id/skip", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, schedule_id, scheduled_time } = req.body;

    // Pull patient + medication snapshot in one query
    const pRes = await db.query(
      `SELECT p.patient_id, p.dosage, m.medication_name, m.dosage_form
         FROM prescriptions p
         LEFT JOIN medications m ON p.medication_id = m.medication_id
        WHERE p.prescription_id = $1`,
      [id]
    );
    if(pRes.rows.length === 0) return res.status(404).json({ success: false, error: "Prescription not found" });
    const row = pRes.rows[0];

    const result = await db.query(`
        INSERT INTO adherence_logs (patient_id, prescription_id, schedule_id, scheduled_time, actual_time, status, notes, medication_name, dosage, route)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'skipped', $5, $6, $7, $8)
        RETURNING *
    `, [row.patient_id, id, schedule_id || null, scheduled_time || new Date().toISOString(), reason, row.medication_name, row.dosage, row.dosage_form]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Log Side Effect
app.post("/api/prescriptions/:id/side_effect", async (req, res) => {
  try {
    const { id } = req.params;
    const { symptoms } = req.body;
    
    const pRes = await db.query('SELECT patient_id FROM prescriptions WHERE prescription_id = $1', [id]);
    if(pRes.rows.length === 0) return res.status(404).json({ success: false, error: "Prescription not found" });
    const pId = pRes.rows[0].patient_id;

    // See if there's an adherence log for today
    const existing = await db.query(`
       SELECT log_id FROM adherence_logs 
       WHERE prescription_id = $1 AND DATE(actual_time) = CURRENT_DATE
       ORDER BY actual_time DESC LIMIT 1
    `, [id]);

    let result;
    if(existing.rows.length > 0) {
        // update existing
        result = await db.query(`
           UPDATE adherence_logs SET side_effects = $1 WHERE log_id = $2 RETURNING *
        `, [symptoms, existing.rows[0].log_id]);
    } else {
        // insert new neutral 'logged' state
        result = await db.query(`
            INSERT INTO adherence_logs (patient_id, prescription_id, scheduled_time, actual_time, status, side_effects)
            VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'logged', $3)
            RETURNING *
        `, [pId, id, symptoms]);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - History
app.get("/api/history/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    const result = await db.query(`
       SELECT
         a.log_id, a.actual_time, a.scheduled_time, a.status, a.notes, a.side_effects,
         COALESCE(m.medication_name, a.medication_name) AS medication_name,
         COALESCE(p.dosage,          a.dosage)          AS dosage,
         COALESCE(m.dosage_form,     a.route)           AS route
       FROM adherence_logs a
       LEFT JOIN prescriptions p ON a.prescription_id = p.prescription_id
       LEFT JOIN medications m  ON p.medication_id  = m.medication_id
       WHERE a.patient_id = $1
       ORDER BY COALESCE(a.actual_time, a.scheduled_time) DESC
    `, [patientId]);
    
    // Grouping day wise directly in Node.
    // Use 24-hour time so the client's log→reminder match (which compares
    // against mappedTime24 like "22:08") succeeds reliably.
    const grouped = {};
    for(let row of result.rows) {
        const anchor = row.actual_time || row.scheduled_time;
        if (!anchor) continue; // should not happen, defensive
        const d = new Date(anchor);
        const dateKey = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const timeKey = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit', hour12: false });
        const scheduled24 = row.scheduled_time
            ? new Date(row.scheduled_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit', hour12: false })
            : timeKey;

        if(!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({
            time: timeKey,
            scheduled_time: scheduled24,
            medication: row.medication_name || '(deleted medication)',
            dosage: row.dosage || '-',
            route: row.route || '-',
            status: row.status,
            reason: row.notes || '-',
            notes: row.side_effects || '-'
        });
    }

    res.json({ success: true, data: grouped });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Wipe history
app.delete("/api/history/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    await db.query(`DELETE FROM adherence_logs WHERE patient_id = $1`, [patientId]);
    res.json({ success: true, message: "History cleared successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API for medication_schedules
app.post("/api/schedules", async (req, res) => {
  try {
    const { prescription_id, time_of_day, dosage_amount } = req.body;

    // Validation
    if (!prescription_id || !time_of_day || !dosage_amount) {
      return res.status(400).json({
        success: false,
        error: "prescription_id, time_of_day, and dosage_amount are required",
      });
    }

    const result = await db.query(
      `INSERT INTO medication_schedules 
       (prescription_id, time_of_day, dosage_amount, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [prescription_id, time_of_day, dosage_amount],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 2. GET - Schedules for a Specific Prescription (SPECIFIC ROUTE - COMES FIRST)
app.get("/api/schedules/prescription/:prescription_id", async (req, res) => {
  try {
    const { prescription_id } = req.params;

    const result = await db.query(
      `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         u.full_name as patient_name,
         m.medication_name,
         m.dosage_form,
         m.strength
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE ms.prescription_id = $1
       ORDER BY ms.time_of_day ASC`,
      [prescription_id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 3. GET - Single Schedule by ID
app.get("/api/schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         p.instructions,
         u.full_name as patient_name,
         m.medication_name,
         m.dosage_form,
         m.strength
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE ms.schedule_id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 4. GET - All Schedules (GENERAL ROUTE - OPTIONAL PATIENT FILTER)
app.get("/api/schedules", async (req, res) => {
  try {
    const { patientId } = req.query;
    let query = `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         u.full_name as patient_name,
         m.medication_name
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id`;
    
    let params = [];
    if (patientId) {
        query += ` WHERE p.patient_id = $1`;
        params.push(patientId);
    }

    query += ` ORDER BY ms.time_of_day ASC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 5. PUT - Update Schedule
app.put("/api/schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { time_of_day, dosage_amount, is_active } = req.body;

    const result = await db.query(
      `UPDATE medication_schedules
       SET time_of_day = COALESCE($1, time_of_day),
           dosage_amount = COALESCE($2, dosage_amount),
           is_active = COALESCE($3, is_active)
       WHERE schedule_id = $4
       RETURNING *`,
      [time_of_day, dosage_amount, is_active, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 6. DELETE - Delete Schedule
app.delete("/api/schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM medication_schedules WHERE schedule_id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Schedule not found",
      });
    }

    res.json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API for reminders
// 1. POST - Create Reminder
=======
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
app.post("/api/reminders", async (req, res) => {
  try {
    const { schedule_id, patient_id, reminder_time, reminder_type } = req.body;
    const status = normalizeReminderStatus(req.body.status) || "pending";
    const normalizedType = normalizeReminderType(reminder_type);

    if (!schedule_id || !patient_id || !reminder_time || !reminder_type) {
      return res.status(400).json({
        success: false,
        error:
          "schedule_id, patient_id, reminder_time, and reminder_type are required",
      });
    }

    if (!VALID_REMINDER_TYPES.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        error: "reminder_type must be one of: push, sms, email, in_app",
      });
    }

    if (!VALID_REMINDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "status must be one of: pending, sent, failed, dismissed",
      });
    }

    const insertQuery =
      status === "sent"
        ? `INSERT INTO reminders 
           (schedule_id, patient_id, reminder_time, reminder_type, status, sent_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           RETURNING *`
        : `INSERT INTO reminders 
           (schedule_id, patient_id, reminder_time, reminder_type, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`;

    const result = await db.query(insertQuery, [
      schedule_id,
      patient_id,
      reminder_time,
      normalizedType,
      status,
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/reminders/patient/:patient_id", async (req, res) => {
  try {
    const { patient_id } = req.params;

    const result = await db.query(
      `SELECT 
         r.*,
         u.full_name as patient_name,
         u.email as patient_email,
         ms.time_of_day,
         ms.dosage_amount,
         p.frequency,
         m.medication_name
       FROM reminders r
       LEFT JOIN users u ON r.patient_id = u.user_id
       LEFT JOIN medication_schedules ms ON r.schedule_id = ms.schedule_id
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE r.patient_id = $1
       ORDER BY r.reminder_time DESC`,
      [patient_id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/reminders/pending", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         r.*,
         u.full_name as patient_name,
         u.phone_number,
         u.email as patient_email,
         ms.time_of_day,
         ms.dosage_amount,
         m.medication_name
       FROM reminders r
       LEFT JOIN users u ON r.patient_id = u.user_id
       LEFT JOIN medication_schedules ms ON r.schedule_id = ms.schedule_id
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE r.status = 'pending'
       ORDER BY r.reminder_time ASC`,
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/reminders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT 
         r.*,
         u.full_name as patient_name,
         u.phone_number,
         u.email as patient_email,
         ms.time_of_day,
         ms.dosage_amount,
         p.frequency,
         p.instructions,
         m.medication_name,
         m.dosage_form,
         m.strength
       FROM reminders r
       LEFT JOIN users u ON r.patient_id = u.user_id
       LEFT JOIN medication_schedules ms ON r.schedule_id = ms.schedule_id
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       WHERE r.reminder_id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Reminder not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/reminders", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         r.*,
         u.full_name as patient_name,
         ms.time_of_day,
         m.medication_name
       FROM reminders r
       LEFT JOIN users u ON r.patient_id = u.user_id
       LEFT JOIN medication_schedules ms ON r.schedule_id = ms.schedule_id
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       ORDER BY r.reminder_time DESC`,
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/reminders/dispatch", async (req, res) => {
  try {
    const dispatchResult = await dispatchDueReminders();
    res.json({
      success: true,
      data: dispatchResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/reminders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "sent", "failed", "dismissed"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "status must be one of: pending, sent, failed, dismissed",
      });
    }
    const updateQuery =
      status === "sent"
        ? `UPDATE reminders
         SET status = $1, sent_at = CURRENT_TIMESTAMP
         WHERE reminder_id = $2
         RETURNING *`
        : `UPDATE reminders
         SET status = $1
         WHERE reminder_id = $2
         RETURNING *`;

    const result = await db.query(updateQuery, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Reminder not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.put("/api/reminders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { reminder_time, reminder_type, status } = req.body;
    const normalizedType = reminder_type
      ? normalizeReminderType(reminder_type)
      : undefined;
    const normalizedStatus = status
      ? normalizeReminderStatus(status)
      : undefined;

    if (reminder_type && !VALID_REMINDER_TYPES.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        error: "reminder_type must be one of: push, sms, email, in_app",
      });
    }

    if (status && !VALID_REMINDER_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        error: "status must be one of: pending, sent, failed, dismissed",
      });
    }

    const result = await db.query(
      `UPDATE reminders
       SET reminder_time = COALESCE($1, reminder_time),
           reminder_type = COALESCE($2, reminder_type),
           status = COALESCE($3, status),
           sent_at = CASE
             WHEN COALESCE($3, status) = 'sent' AND sent_at IS NULL THEN CURRENT_TIMESTAMP
             ELSE sent_at
           END
       WHERE reminder_id = $4
       RETURNING *`,
      [reminder_time, normalizedType, normalizedStatus, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Reminder not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/reminders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM reminders WHERE reminder_id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Reminder not found",
      });
    }

    res.json({
      success: true,
      message: "Reminder deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

<<<<<<< HEAD
// API for Google Cloud Vision OCR
app.post("/api/ocr", async (req, res) => {
  const { image } = req.body; // expected: data URI or bare base64 string

  if (!image) {
    return res.status(400).json({ success: false, error: "No image data provided" });
  }

  try {
    // Pick up the mime type from the data URI prefix; fall back to jpeg
    // when callers send a bare base64 string.
    const mimeMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const base64Data = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");

    const fullText = await extractTextWithGemini(base64Data, mimeType);
    res.status(200).json({ success: true, text: fullText });
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.code || error.status || null,
    });
  }
});

// Gemini accepts PDFs natively via inlineData, so the old per-page dance
// collapses into a single call.
app.post("/api/ocr-pdf", async (req, res) => {
  const { pdfBase64 } = req.body;

  if (!pdfBase64) {
    return res.status(400).json({ success: false, error: "No PDF data provided" });
  }

  try {
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
    const fullText = await extractTextWithGemini(base64Data, "application/pdf");
    res.status(200).json({ success: true, text: fullText });
  } catch (error) {
    console.error("Gemini PDF OCR Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.code || error.status || null,
    });
  }
});

// Twilio SMS helper — normalizes the phone, calls Twilio, and returns a
// uniform result the rest of the server already consumes.
// Shape: { ok: boolean, sentTo: string, provider: <raw Twilio response>,
//          error?: string, httpStatus: number }
function normalizePhoneIN(p) {
  return String(p || "").replace(/\D/g, "").slice(-10);
}

// Lazily instantiate the Twilio client so the server still boots when
// credentials are missing (useful for local dev / demos without SMS).
let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  twilioClient = twilio(sid, token);
  return twilioClient;
}

async function sendSms(phoneNumber, message) {
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const client = getTwilioClient();
  if (!client || !fromNumber) {
    return {
      ok: false,
      sentTo: null,
      provider: null,
      error: "Twilio credentials missing — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in .env",
      httpStatus: 500,
    };
  }

  const ten = normalizePhoneIN(phoneNumber);
  if (ten.length !== 10) {
    return {
      ok: false,
      sentTo: ten,
      provider: null,
      error: `Invalid phone after normalize: '${phoneNumber}' -> '${ten}'`,
      httpStatus: 400,
    };
  }
  const to = `+91${ten}`; // Twilio requires E.164 format

  try {
    const msg = await client.messages.create({
      body: `[SafeMeds Alert]: ${message}`,
      from: fromNumber,
      to,
    });
    // Twilio considers queued/sent/delivered as successful submission.
    // errorCode is non-null only on a rejection at submission time.
    const ok = !msg.errorCode;
    const payload = {
      sid: msg.sid,
      status: msg.status,
      to: msg.to,
      from: msg.from,
      errorCode: msg.errorCode || null,
      errorMessage: msg.errorMessage || null,
    };
    console.log(`[SMS] to=${to} ok=${ok} sid=${msg.sid} status=${msg.status}`);
    return {
      ok,
      sentTo: to,
      provider: payload,
      error: ok ? undefined : (msg.errorMessage || `Twilio errorCode=${msg.errorCode}`),
      httpStatus: ok ? 200 : 502,
    };
  } catch (err) {
    // Twilio throws a RestException with code + message for validation /
    // permission errors (e.g. code 21608 = unverified number on trial).
    const rawCode = err.code || err.status;
    const rawMsg = err.message || "Unknown Twilio error";
    console.error(`[SMS] Twilio error code=${rawCode} message=${rawMsg}`);
    return {
      ok: false,
      sentTo: to,
      provider: { errorCode: rawCode, errorMessage: rawMsg, moreInfo: err.moreInfo || null },
      error: `Twilio ${rawCode || "error"}: ${rawMsg}`,
      httpStatus: 502,
    };
  }
}

// API for sending SMS via Twilio
app.post("/api/send-reminder", async (req, res) => {
  const { phoneNumber, message } = req.body;
  const result = await sendSms(phoneNumber, message);
  res.status(result.httpStatus).json({
    success: result.ok,
    sentTo: result.sentTo,
    provider: result.provider,
    error: result.ok ? undefined : result.error,
  });
});

// Debug: verify Twilio account state without a full reminder
app.get("/api/sms-test", async (req, res) => {
  const phone = req.query.phone;
  const message = req.query.message || "SafeMeds test message. If you received this, SMS works.";
  const result = await sendSms(phone, message);
  res.status(result.httpStatus).json({
    success: result.ok,
    sentTo: result.sentTo,
    provider: result.provider,
    error: result.ok ? undefined : result.error,
  });
});

=======
startReminderDispatcher();
>>>>>>> 4f4168d16d2e40cb3c87c8a5df1f1a33cc55010e
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
