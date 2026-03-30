import pg from "pg";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
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
async function connectToDatabase() {
  try {
    await db.connect();
    console.log("Database connection successful");
  } catch (error) {
    console.log(error);
  }
}
connectToDatabase();

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
    const result = await db.query(
      `SELECT p.*, 
              u.full_name as patient_name,
              d.full_name as doctor_name,
              m.medication_name,
              m.dosage_form,
              m.strength
       FROM prescriptions p
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN users d ON p.doctor_id = d.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       ORDER BY p.created_at DESC`,
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
    } = req.body;

    const result = await db.query(
      `INSERT INTO prescriptions 
       (patient_id, doctor_id, medication_id, dosage, frequency, start_date, end_date, instructions) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
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
    // ✅ ADD THIS LINE - extract variables from request body
    const { dosage, frequency, start_date, end_date, instructions, is_active } =
      req.body;

    const result = await db.query(
      `UPDATE prescriptions 
       SET dosage = COALESCE($1, dosage),
           frequency = COALESCE($2, frequency),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date),
           instructions = COALESCE($5, instructions),
           is_active = COALESCE($6, is_active)
       WHERE prescription_id = $7
       RETURNING *`,
      [dosage, frequency, start_date, end_date, instructions, is_active, id],
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

// 4. GET - All Schedules (GENERAL ROUTE - COMES LAST)
app.get("/api/schedules", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         ms.*,
         p.dosage as prescription_dosage,
         p.frequency,
         u.full_name as patient_name,
         m.medication_name
       FROM medication_schedules ms
       LEFT JOIN prescriptions p ON ms.prescription_id = p.prescription_id
       LEFT JOIN users u ON p.patient_id = u.user_id
       LEFT JOIN medications m ON p.medication_id = m.medication_id
       ORDER BY ms.time_of_day ASC`,
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
app.post("/api/reminders", async (req, res) => {
  try {
    const { schedule_id, patient_id, reminder_time, reminder_type } = req.body;

    // Validation
    if (!schedule_id || !patient_id || !reminder_time || !reminder_type) {
      return res.status(400).json({
        success: false,
        error:
          "schedule_id, patient_id, reminder_time, and reminder_type are required",
      });
    }

    // Validate reminder_type
    const validTypes = ["push", "sms", "email", "in_app"];
    if (!validTypes.includes(reminder_type)) {
      return res.status(400).json({
        success: false,
        error: "reminder_type must be one of: push, sms, email, in_app",
      });
    }

    const result = await db.query(
      `INSERT INTO reminders 
       (schedule_id, patient_id, reminder_time, reminder_type, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [schedule_id, patient_id, reminder_time, reminder_type],
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

// 2. GET - Reminders for a Specific Patient (SPECIFIC ROUTE FIRST)
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

// 3. GET - Pending Reminders (SPECIFIC ROUTE)
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

// 4. GET - Single Reminder by ID
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

// 5. GET - All Reminders (GENERAL ROUTE LAST)
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

// 6. PUT - Update Reminder Status (mark as sent/dismissed/failed)
app.put("/api/reminders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validation
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

// 7. PUT - Update Reminder (general update)
app.put("/api/reminders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { reminder_time, reminder_type } = req.body;

    // Validate reminder_type if provided
    if (reminder_type) {
      const validTypes = ["push", "sms", "email", "in_app"];
      if (!validTypes.includes(reminder_type)) {
        return res.status(400).json({
          success: false,
          error: "reminder_type must be one of: push, sms, email, in_app",
        });
      }
    }

    const result = await db.query(
      `UPDATE reminders
       SET reminder_time = COALESCE($1, reminder_time),
           reminder_type = COALESCE($2, reminder_type)
       WHERE reminder_id = $3
       RETURNING *`,
      [reminder_time, reminder_type, id],
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

// 8. DELETE - Delete Reminder
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
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
