CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS
-- ============================================
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. MEDICATIONS (Simplified)
-- ============================================
CREATE TABLE medications (
    medication_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medication_name VARCHAR(255) NOT NULL,
    dosage_form VARCHAR(100) NOT NULL, -- tablet, capsule, liquid
    strength VARCHAR(100), -- 500mg, 10ml
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. PRESCRIPTIONS
-- ============================================
CREATE TABLE prescriptions (
    prescription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    medication_id UUID NOT NULL REFERENCES medications(medication_id) ON DELETE CASCADE,
    dosage VARCHAR(100) NOT NULL, -- 2 tablets, 5ml
    frequency VARCHAR(100) NOT NULL, -- 3 times daily
    start_date DATE NOT NULL,
    end_date DATE,
    instructions TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. MEDICATION SCHEDULES
-- ============================================
CREATE TABLE medication_schedules (
    schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
    time_of_day TIME NOT NULL, -- 08:00, 14:00, 20:00
    dosage_amount VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. REMINDERS
-- ============================================
CREATE TABLE reminders (
    reminder_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES medication_schedules(schedule_id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reminder_time TIMESTAMP NOT NULL,
    reminder_type VARCHAR(50) NOT NULL CHECK (reminder_type IN ('push', 'sms', 'email', 'in_app')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dismissed')),
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_schedules_prescription ON medication_schedules(prescription_id);
CREATE INDEX idx_reminders_patient ON reminders(patient_id);
CREATE INDEX idx_reminders_time ON reminders(reminder_time);
CREATE INDEX idx_reminders_status ON reminders(status);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prescriptions_updated_at BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
