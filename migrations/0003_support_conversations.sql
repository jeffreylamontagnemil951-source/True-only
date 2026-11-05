PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS support_departments(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL,UNIQUE(school_id,name));
ALTER TABLE support_tickets ADD COLUMN department_id TEXT REFERENCES support_departments(id);
CREATE INDEX IF NOT EXISTS idx_support_department ON support_tickets(school_id,department_id,status,updated_at);
CREATE TABLE IF NOT EXISTS support_reports(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),ticket_id TEXT NOT NULL REFERENCES support_tickets(id),message_id TEXT NOT NULL REFERENCES support_messages(id),reporter_admin_id TEXT NOT NULL REFERENCES administrators(id),reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')),reviewed_by TEXT REFERENCES administrators(id),created_at TEXT NOT NULL,reviewed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_support_reports_school_status ON support_reports(school_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages(ticket_id,created_at);
