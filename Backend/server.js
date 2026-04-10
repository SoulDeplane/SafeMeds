import pg from "pg";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("../Frontend"));
dotenv.config();
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
    await runMigrations();
  } catch (error) {
    console.log("Database connection error:", error);
  }
}
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

startReminderDispatcher();
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
