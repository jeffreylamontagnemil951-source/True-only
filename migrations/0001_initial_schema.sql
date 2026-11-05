PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','suspended')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS administrators (
  id TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super_admin','admin','viewer','support')),
  school_id TEXT NOT NULL REFERENCES schools(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_school ON administrators(school_id,active);
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT NOT NULL,
  school_id TEXT NOT NULL REFERENCES schools(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  section TEXT,
  school_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  photo_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(school_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(school_id,last_name,first_name);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(school_id,status);
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#5c8dff',
  icon_key TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS student_badges (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  badge_id TEXT NOT NULL REFERENCES badges(id),
  issuer_admin_id TEXT NOT NULL REFERENCES administrators(id),
  reason TEXT,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,student_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES administrators(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  requester_admin_id TEXT REFERENCES administrators(id),
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  assigned_admin_id TEXT REFERENCES administrators(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  sender_admin_id TEXT REFERENCES administrators(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
