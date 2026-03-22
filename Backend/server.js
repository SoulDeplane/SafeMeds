import pg from "pg";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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

// 1. GET all users
app.get("/api/users", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 2. GET single user by ID
app.get("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at FROM users WHERE user_id = $1",
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    // console.log(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
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
        error: "email, full_name, and role are required"
      });
    }
    
    // Validate role
    const validRoles = ['patient', 'doctor', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: "role must be 'patient', 'doctor', or 'admin'"
      });
    }
    
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone_number, date_of_birth, role) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING user_id, email, full_name, phone_number, date_of_birth, role, is_active, created_at`,
      [email, 'no_password', full_name, phone_number, date_of_birth, role]
    );
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    // Handle unique constraint violation (duplicate email)
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: "Email already exists"
      });
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. PUT - Update user
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, phone_number, date_of_birth, role, is_active } = req.body;
    
    // Validate role if provided
    if (role) {
      const validRoles = ['patient', 'doctor', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: "role must be 'patient', 'doctor', or 'admin'"
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
      [email, full_name, phone_number, date_of_birth, role, is_active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: "Email already exists"
      });
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. DELETE user
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      "DELETE FROM users WHERE user_id = $1 RETURNING user_id",
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
