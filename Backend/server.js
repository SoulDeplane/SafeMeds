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








app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
