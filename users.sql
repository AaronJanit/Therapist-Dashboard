-- Users table for authentication
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    therapistId TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'Therapist',
    bank_name TEXT,
    bank_account_name TEXT,
    bank_sort_code TEXT,
    bank_account_number TEXT,
    paypal_url TEXT,
    default_payment_text TEXT
);

-- Clients table
CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    therapistId TEXT NOT NULL,
    dateOfBirth TEXT,
    emergencyContact TEXT,
    issue TEXT,
    lastVisit TEXT,
    status TEXT DEFAULT 'Active',
    FOREIGN KEY (therapistId) REFERENCES users(therapistId)
);

-- Notes table
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    therapistId TEXT NOT NULL,
    date TEXT NOT NULL,
    content TEXT,
    FOREIGN KEY (clientId) REFERENCES clients(id),
    FOREIGN KEY (therapistId) REFERENCES users(therapistId)
);

-- Schedule table
CREATE TABLE schedule (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    clientId TEXT NOT NULL,
    therapistId TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed',
    FOREIGN KEY (clientId) REFERENCES clients(id),
    FOREIGN KEY (therapistId) REFERENCES users(therapistId)
);

-- Insert default user with a fixed therapist ID
INSERT INTO users (therapistId, username, password, full_name, email) VALUES ('therapist-001', 'therapist', 'password123', 'Dr. Therapist', 'therapist@example.com');

-- Insert dummy clients for default therapist
INSERT INTO clients (id, name, email, phone, therapistId, dateOfBirth, emergencyContact, issue, lastVisit, status) VALUES
('c1', 'Elena Rodriguez', 'elena.r@example.com', '(555) 201-4421', 'therapist-001', '1988-06-14', 'Jordan Rodriguez — (555) 201-7700', 'Grief Counseling', '2026-04-13', 'Active'),
('c2', 'Marcus Chen', 'marcus.c@example.com', '(555) 310-8892', 'therapist-001', '1992-11-02', 'Wei Chen — (555) 310-1100', 'Medication Management', '2026-04-10', 'Active'),
('c3', 'Sarah Jenkins', 'sarah.j@example.com', '(555) 447-2210', 'therapist-001', '1990-04-21', 'Alex Jenkins — (555) 447-0091', 'Anxiety', '2026-04-10', 'Inactive');

-- Insert dummy notes for default therapist
INSERT INTO notes (id, clientId, therapistId, date, content) VALUES
('n1', 'c1', 'therapist-001', '2026-04-13', 'Discussed grief cycles. Client exhibited good insight. Assigned journaling homework.'),
('n2', 'c2', 'therapist-001', '2026-04-08', 'Evaluated medication efficacy. Patient reports 20% reduction in panic attacks.');

-- Insert dummy schedule for default therapist
INSERT INTO schedule (id, date, time, clientId, therapistId, status) VALUES
('s1', '2026-04-13', '09:00', 'c1', 'therapist-001', 'confirmed'),
('s2', '2026-04-13', '14:00', 'c2', 'therapist-001', 'confirmed'),
('s3', '2026-04-14', '10:00', 'c3', 'therapist-001', 'confirmed');