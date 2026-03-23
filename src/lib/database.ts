import initSqlJs, { Database } from 'sql.js';
import { get, set } from 'idb-keyval';

const DB_KEY = 'ticketing-system-db';

let db: Database | null = null;
let dbReady: Promise<Database> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'unit_user',
  team_id INTEGER,
  unit TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  ticket_type TEXT DEFAULT 'general',
  status TEXT DEFAULT 'draft',
  priority TEXT DEFAULT 'medium',
  severity TEXT DEFAULT 'normal',
  category_id INTEGER,
  module TEXT,
  sub_module TEXT,
  observation_type TEXT,
  requester_id INTEGER NOT NULL,
  assigned_team_id INTEGER,
  assigned_user_id INTEGER,
  unit TEXT,
  due_date TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (assigned_team_id) REFERENCES teams(id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_internal INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  user_id INTEGER,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  read INTEGER DEFAULT 0,
  ticket_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_team ON tickets(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_user ON tickets(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`;

const SEED = `
INSERT OR IGNORE INTO teams (id, name, description) VALUES
  (1, 'IT Support', 'General IT support and infrastructure'),
  (2, 'MISO Operations', 'Equipment and voucher management'),
  (3, 'Network Team', 'Network infrastructure and connectivity'),
  (4, 'Security Team', 'Security incidents and access control');

INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES
  (1, 'Hardware', NULL),
  (2, 'Software', NULL),
  (3, 'Network', NULL),
  (4, 'Equipment', NULL),
  (5, 'Voucher', NULL),
  (6, 'Access Request', NULL),
  (7, 'Desktop', 1),
  (8, 'Laptop', 1),
  (9, 'Printer', 1),
  (10, 'Issue Voucher', 5),
  (11, 'Deposit Voucher', 5),
  (12, 'Transfer Voucher', 5);

INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, team_id, unit) VALUES
  (1, 'admin', 'admin123', 'System Administrator', 'super_admin', NULL, 'HQ'),
  (2, 'g1_officer', 'pass123', 'Col. Sharma (G1)', 'g1_triage', NULL, 'HQ'),
  (3, 'it_lead', 'pass123', 'Maj. Singh', 'resolver', 1, 'IT Div'),
  (4, 'miso_officer', 'pass123', 'Lt. Col. Verma', 'miso_officer', 2, 'MISO'),
  (5, 'unit_alpha', 'pass123', 'Capt. Rathore', 'unit_user', NULL, '14 Rajput'),
  (6, 'unit_bravo', 'pass123', 'Maj. Chauhan', 'unit_user', NULL, '9 Para SF'),
  (7, 'net_tech', 'pass123', 'Hav. Kumar', 'resolver', 3, 'Sig Regt'),
  (8, 'auditor', 'pass123', 'Brig. Mehta', 'auditor', NULL, 'HQ');

INSERT OR IGNORE INTO tickets (id, ticket_number, title, description, ticket_type, status, priority, severity, category_id, module, requester_id, assigned_team_id, assigned_user_id, unit, created_at) VALUES
  (1, 'TKT-2025-00001', 'Network connectivity failure in Building C', 'Complete loss of LAN connectivity affecting 40+ workstations in Building C, Wing 2. Started at 0600 hrs today.', 'general', 'in_progress', 'critical', 'critical', 3, 'Infrastructure', 5, 3, 7, '14 Rajput', '2025-03-20 06:30:00'),
  (2, 'TKT-2025-00002', 'Issue Voucher - 10x Radio Sets AN/PRC-152', 'Request issue of 10 units of AN/PRC-152 tactical radio sets for upcoming exercise TRISHUL SHAKTI.', 'issue_voucher', 'pending_validation', 'high', 'normal', 10, 'Communications', 6, 2, 4, '9 Para SF', '2025-03-21 09:00:00'),
  (3, 'TKT-2025-00003', 'Transfer of 2x Generator Sets to 21 Mech', 'Transfer of 2 units of 15KVA Generator Sets from our holding to 21 Mech Inf as per movement order.', 'transfer_voucher', 'submitted', 'medium', 'normal', 12, 'Equipment', 5, 2, NULL, '14 Rajput', '2025-03-22 10:15:00'),
  (4, 'TKT-2025-00004', 'Software installation request - ALIS workstation', 'Require installation of Automated Logistics Information System on 5 workstations.', 'general', 'allocated', 'medium', 'normal', 2, 'Software', 6, 1, 3, '9 Para SF', '2025-03-22 14:00:00'),
  (5, 'TKT-2025-00005', 'Access request for classified network terminal', 'Request access credentials for SCI terminal for newly posted officer.', 'general', 'submitted', 'high', 'high', 6, 'Security', 5, NULL, NULL, '14 Rajput', '2025-03-23 08:00:00');

INSERT OR IGNORE INTO comments (ticket_id, user_id, content, is_internal, created_at) VALUES
  (1, 7, 'Dispatched team to Building C. Initial assessment: fiber optic cable damage at distribution panel DP-C2.', 0, '2025-03-20 07:45:00'),
  (1, 7, 'Replacement splice kit required. ETA for repair: 4 hours.', 0, '2025-03-20 08:30:00'),
  (1, 3, 'Internal: Check if this is related to the construction work near Building C reported last week.', 1, '2025-03-20 09:00:00'),
  (2, 4, 'Documents received. Verifying authorization letter and indent form against holding records.', 0, '2025-03-21 10:00:00'),
  (2, 4, 'Authorization verified. Indent quantity matches allocation. Processing issue voucher.', 0, '2025-03-21 14:30:00'),
  (3, 2, 'Ticket received at G1. Forwarding to MISO for validation of transfer documents.', 0, '2025-03-22 11:00:00');

INSERT OR IGNORE INTO audit_log (entity_type, entity_id, action, user_id, details, created_at) VALUES
  ('ticket', 1, 'created', 5, 'Ticket TKT-2025-00001 created', '2025-03-20 06:30:00'),
  ('ticket', 1, 'status_changed', 2, 'Status: submitted → allocated', '2025-03-20 07:00:00'),
  ('ticket', 1, 'assigned', 2, 'Assigned to Network Team / Hav. Kumar', '2025-03-20 07:00:00'),
  ('ticket', 1, 'status_changed', 7, 'Status: allocated → in_progress', '2025-03-20 07:45:00'),
  ('ticket', 2, 'created', 6, 'Ticket TKT-2025-00002 created', '2025-03-21 09:00:00'),
  ('ticket', 2, 'status_changed', 2, 'Status: submitted → pending_validation', '2025-03-21 09:30:00'),
  ('user', 1, 'login', 1, 'Admin login', '2025-03-23 08:00:00');
`;

async function saveDb() {
  if (db) {
    const data = db.export();
    await set(DB_KEY, data);
  }
}

export async function getDb(): Promise<Database> {
  if (dbReady) return dbReady;

  dbReady = (async () => {
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    const savedData = await get(DB_KEY);
    if (savedData) {
      db = new SQL.Database(new Uint8Array(savedData as ArrayBuffer));
      // Ensure schema exists (for migrations)
      db.run(SCHEMA);
    } else {
      db = new SQL.Database();
      db.run(SCHEMA);
      db.run(SEED);
      await saveDb();
    }

    return db;
  })();

  return dbReady;
}

export async function runQuery(sql: string, params?: any[]): Promise<any[]> {
  const database = await getDb();
  const stmt = database.prepare(sql);
  if (params) stmt.bind(params);

  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export async function runExec(sql: string, params?: any[]): Promise<void> {
  const database = await getDb();
  if (params) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  } else {
    database.run(sql);
  }
  await saveDb();
}

export async function getLastInsertId(): Promise<number> {
  const result = await runQuery('SELECT last_insert_rowid() as id');
  return result[0]?.id ?? 0;
}

export function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  return `TKT-${year}-${rand}`;
}
