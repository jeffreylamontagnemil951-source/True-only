PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS permission_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
  granted_by TEXT NOT NULL REFERENCES administrators(id),
  created_at TEXT NOT NULL,
  UNIQUE(admin_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_permission_overrides_admin ON permission_overrides(admin_id);

CREATE TABLE IF NOT EXISTS badge_events (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL,
  badge_id TEXT NOT NULL REFERENCES badges(id),
  action TEXT NOT NULL CHECK(action IN ('issued','revoked')),
  actor_id TEXT NOT NULL REFERENCES administrators(id),
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,student_id)
);

CREATE INDEX IF NOT EXISTS idx_badge_events_student ON badge_events(school_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS idx_support_school_status ON support_tickets(school_id,status,priority,updated_at);

ALTER TABLE support_tickets ADD COLUMN requester_type TEXT NOT NULL DEFAULT 'school_staff';
ALTER TABLE support_tickets ADD COLUMN description TEXT NOT NULL DEFAULT '';
