PRAGMA foreign_keys=ON;

CREATE INDEX IF NOT EXISTS idx_support_messages_history
ON support_messages(ticket_id,created_at DESC,id DESC);

CREATE TRIGGER IF NOT EXISTS support_ticket_school_guard_insert
BEFORE INSERT ON support_tickets
BEGIN
 SELECT CASE WHEN NEW.requester_admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM administrators WHERE id=NEW.requester_admin_id AND school_id=NEW.school_id) THEN RAISE(ABORT,'support requester must belong to ticket school') END;
 SELECT CASE WHEN NEW.assigned_admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM administrators WHERE id=NEW.assigned_admin_id AND school_id=NEW.school_id) THEN RAISE(ABORT,'support assignee must belong to ticket school') END;
 SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM support_departments WHERE id=NEW.department_id AND school_id=NEW.school_id) THEN RAISE(ABORT,'support department must belong to ticket school') END;
END;

CREATE TRIGGER IF NOT EXISTS support_ticket_school_guard_update
BEFORE UPDATE OF school_id,requester_admin_id,assigned_admin_id,department_id ON support_tickets
BEGIN
 SELECT CASE WHEN NEW.requester_admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM administrators WHERE id=NEW.requester_admin_id AND school_id=NEW.school_id) THEN RAISE(ABORT,'support requester must belong to ticket school') END;
 SELECT CASE WHEN NEW.assigned_admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM administrators WHERE id=NEW.assigned_admin_id AND school_id=NEW.school_id) THEN RAISE(ABORT,'support assignee must belong to ticket school') END;
 SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM support_departments WHERE id=NEW.department_id AND school_id=NEW.school_id) THEN RAISE(ABORT,'support department must belong to ticket school') END;
END;

CREATE TRIGGER IF NOT EXISTS support_message_school_guard_insert
BEFORE INSERT ON support_messages WHEN NEW.sender_admin_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM support_tickets t JOIN administrators a ON a.id=NEW.sender_admin_id AND a.school_id=t.school_id WHERE t.id=NEW.ticket_id) THEN RAISE(ABORT,'support message sender must belong to ticket school') END;
END;

CREATE TRIGGER IF NOT EXISTS support_message_school_guard_update
BEFORE UPDATE OF ticket_id,sender_admin_id ON support_messages WHEN NEW.sender_admin_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM support_tickets t JOIN administrators a ON a.id=NEW.sender_admin_id AND a.school_id=t.school_id WHERE t.id=NEW.ticket_id) THEN RAISE(ABORT,'support message sender must belong to ticket school') END;
END;

CREATE TRIGGER IF NOT EXISTS support_report_school_guard_insert
BEFORE INSERT ON support_reports
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM support_tickets t JOIN support_messages m ON m.id=NEW.message_id AND m.ticket_id=t.id JOIN administrators r ON r.id=NEW.reporter_admin_id AND r.school_id=t.school_id WHERE t.id=NEW.ticket_id AND t.school_id=NEW.school_id) THEN RAISE(ABORT,'support report references must belong to the same school and ticket') END;
 SELECT CASE WHEN NEW.reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM administrators WHERE id=NEW.reviewed_by AND school_id=NEW.school_id) THEN RAISE(ABORT,'support report reviewer must belong to report school') END;
END;

CREATE TRIGGER IF NOT EXISTS support_report_school_guard_update
BEFORE UPDATE OF school_id,ticket_id,message_id,reporter_admin_id,reviewed_by ON support_reports
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM support_tickets t JOIN support_messages m ON m.id=NEW.message_id AND m.ticket_id=t.id JOIN administrators r ON r.id=NEW.reporter_admin_id AND r.school_id=t.school_id WHERE t.id=NEW.ticket_id AND t.school_id=NEW.school_id) THEN RAISE(ABORT,'support report references must belong to the same school and ticket') END;
 SELECT CASE WHEN NEW.reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM administrators WHERE id=NEW.reviewed_by AND school_id=NEW.school_id) THEN RAISE(ABORT,'support report reviewer must belong to report school') END;
END;
