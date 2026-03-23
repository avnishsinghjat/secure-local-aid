import initSqlJs, { Database } from 'sql.js';
import { get, set, del } from 'idb-keyval';

const DB_KEY = 'ticketing-system-db';
const DB_VERSION_KEY = 'ticketing-system-db-version';
const CURRENT_VERSION = 4; // bump to force re-seed

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
-- Teams
INSERT OR IGNORE INTO teams (id, name, description) VALUES
  (1, 'IT Support', 'General IT support, hardware/software troubleshooting and infrastructure'),
  (2, 'MISO Operations', 'Equipment management, voucher processing and holding state changes'),
  (3, 'Network Team', 'Network infrastructure, connectivity and communications'),
  (4, 'Security Team', 'Security incidents, access control and classified systems'),
  (5, 'Logistics Cell', 'Supply chain, transport and material movement'),
  (6, 'Signals Regiment', 'Communications equipment maintenance and deployment');

-- Categories
INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES
  (1, 'Hardware', NULL),
  (2, 'Software', NULL),
  (3, 'Network', NULL),
  (4, 'Equipment', NULL),
  (5, 'Voucher', NULL),
  (6, 'Access Request', NULL),
  (7, 'Maintenance', NULL),
  (8, 'Desktop', 1),
  (9, 'Laptop', 1),
  (10, 'Printer', 1),
  (11, 'Server', 1),
  (12, 'Issue Voucher', 5),
  (13, 'Deposit Voucher', 5),
  (14, 'Transfer Voucher', 5),
  (15, 'Return Voucher', 5),
  (16, 'LAN', 3),
  (17, 'WAN', 3),
  (18, 'VPN', 3),
  (19, 'Preventive', 7),
  (20, 'Corrective', 7);

-- Users (all passwords shown on login screen)
INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, team_id, unit) VALUES
  (1, 'admin', 'admin123', 'Brig. Anand Prakash', 'super_admin', NULL, 'HQ Formation'),
  (2, 'g1_officer', 'pass123', 'Col. R.K. Sharma', 'g1_triage', NULL, 'HQ G1 Branch'),
  (3, 'it_lead', 'pass123', 'Maj. Pradeep Singh', 'resolver', 1, 'IT Division'),
  (4, 'miso_officer', 'pass123', 'Lt. Col. Arun Verma', 'miso_officer', 2, 'MISO Cell'),
  (5, 'unit_alpha', 'pass123', 'Capt. Vikram Rathore', 'unit_user', NULL, '14 Rajput'),
  (6, 'unit_bravo', 'pass123', 'Maj. Deepak Chauhan', 'unit_user', NULL, '9 Para SF'),
  (7, 'net_tech', 'pass123', 'Hav. Rajesh Kumar', 'resolver', 3, 'Sig Regt'),
  (8, 'auditor', 'pass123', 'Brig. S.K. Mehta', 'auditor', NULL, 'HQ Inspectorate'),
  (9, 'sec_officer', 'pass123', 'Maj. Neha Kapoor', 'resolver', 4, 'Security Cell'),
  (10, 'log_officer', 'pass123', 'Capt. Arjun Desai', 'resolver', 5, 'Log Cell'),
  (11, 'unit_charlie', 'pass123', 'Lt. Col. M.S. Rawat', 'unit_user', NULL, '21 Mech Inf'),
  (12, 'unit_delta', 'pass123', 'Maj. Suresh Yadav', 'unit_user', NULL, '4 Grenadiers'),
  (13, 'sig_tech', 'pass123', 'Nk. Pawan Tiwari', 'resolver', 6, 'Sig Regt'),
  (14, 'g1_staff', 'pass123', 'Maj. Kavita Nair', 'g1_triage', NULL, 'HQ G1 Branch');

-- Tickets (25 realistic tickets across various types and statuses)
INSERT OR IGNORE INTO tickets (id, ticket_number, title, description, ticket_type, status, priority, severity, category_id, module, sub_module, observation_type, requester_id, assigned_team_id, assigned_user_id, unit, due_date, resolved_at, closed_at, created_at) VALUES
  (1, 'TKT-2025-00001', 'Network connectivity failure in Building C', 'Complete loss of LAN connectivity affecting 40+ workstations in Building C, Wing 2. Started at 0600 hrs today. All VoIP phones also non-functional. Suspected fiber cut near DP-C2.', 'general', 'in_progress', 'critical', 'critical', 16, 'Infrastructure', 'LAN', NULL, 5, 3, 7, '14 Rajput', '2025-03-21', NULL, NULL, '2025-03-20 06:30:00'),
  (2, 'TKT-2025-00002', 'Issue Voucher - 10x Radio Sets AN/PRC-152', 'Request issue of 10 units of AN/PRC-152 tactical radio sets for upcoming exercise TRISHUL SHAKTI. Authorization letter and indent form attached. Required by 28 Mar 2025.', 'issue_voucher', 'pending_validation', 'high', 'normal', 12, 'Communications', 'Tactical Radio', 'Equipment Issue', 6, 2, 4, '9 Para SF', '2025-03-28', NULL, NULL, '2025-03-21 09:00:00'),
  (3, 'TKT-2025-00003', 'Transfer of 2x Generator Sets to 21 Mech', 'Transfer of 2 units of 15KVA Generator Sets (DG Set Kirloskar) from our holding to 21 Mech Inf as per movement order MO/2025/347. Transfer voucher and CRV attached.', 'transfer_voucher', 'submitted', 'medium', 'normal', 14, 'Equipment', 'Power Systems', 'Equipment Transfer', 5, 2, NULL, '14 Rajput', '2025-04-05', NULL, NULL, '2025-03-22 10:15:00'),
  (4, 'TKT-2025-00004', 'Software installation - ALIS workstation', 'Require installation of Automated Logistics Information System (ALIS v3.2) on 5 workstations at Logistics Cell. License keys available. Need IT team assistance for deployment and configuration.', 'general', 'allocated', 'medium', 'normal', 2, 'Software', 'Enterprise Applications', NULL, 6, 1, 3, '9 Para SF', '2025-03-30', NULL, NULL, '2025-03-22 14:00:00'),
  (5, 'TKT-2025-00005', 'Access request for SCI terminal', 'Request access credentials for SCI terminal for newly posted officer Lt. Col. Rajan (IC-XXXXX). Security clearance verification docs attached. Requires urgent processing.', 'general', 'submitted', 'high', 'high', 6, 'Security', 'Access Control', NULL, 5, 4, 9, '14 Rajput', '2025-03-25', NULL, NULL, '2025-03-23 08:00:00'),
  (6, 'TKT-2025-00006', 'Printer malfunction - Admin Block Floor 3', 'HP LaserJet Pro MFP M428 showing persistent paper jam error (Error E6). Cleared jam multiple times but error persists. Serial: VNB3K12345. Affecting 15 personnel.', 'general', 'resolved', 'low', 'normal', 10, 'Hardware', 'Printer', NULL, 12, 1, 3, '4 Grenadiers', '2025-03-22', '2025-03-21 16:30:00', NULL, '2025-03-20 11:00:00'),
  (7, 'TKT-2025-00007', 'Deposit Voucher - 5x Night Vision Devices', 'Deposit of 5x Night Vision Device (NVD) AN/PVS-14 post exercise NIGHT HAWK. All units serviceable. Inspection report and deposit voucher attached.', 'deposit_voucher', 'in_progress', 'medium', 'normal', 13, 'Equipment', 'Surveillance', 'Equipment Deposit', 11, 2, 4, '21 Mech Inf', '2025-03-28', NULL, NULL, '2025-03-22 08:30:00'),
  (8, 'TKT-2025-00008', 'VPN tunnel down - HQ to Forward Area', 'Site-to-site VPN tunnel between HQ (10.1.0.0/24) and Forward Operating Base Alpha (10.5.0.0/24) is down since 0400 hrs. IPSec Phase 2 negotiation failing. Affecting real-time situational awareness feeds.', 'general', 'in_progress', 'critical', 'critical', 18, 'Infrastructure', 'VPN', NULL, 11, 3, 7, '21 Mech Inf', '2025-03-23', NULL, NULL, '2025-03-23 04:15:00'),
  (9, 'TKT-2025-00009', 'Issue Voucher - 200x Camouflage Nets', 'Request issue of 200 units of Camouflage Net (Multispectral) from Central Ordnance Depot for upcoming field deployment. Indent no. IND/2025/892.', 'issue_voucher', 'under_triage', 'medium', 'normal', 12, 'Equipment', 'Field Stores', 'Equipment Issue', 12, NULL, NULL, '4 Grenadiers', '2025-04-10', NULL, NULL, '2025-03-23 07:00:00'),
  (10, 'TKT-2025-00010', 'Server room AC failure - Data Center', 'Primary AC unit in Server Room B failed at 2200 hrs. Temperature rising to 32C. Secondary unit running at full capacity. Require emergency repair/replacement to prevent equipment damage.', 'general', 'resolved', 'critical', 'high', 7, 'Infrastructure', 'Cooling', NULL, 3, 1, 3, 'IT Division', '2025-03-21', '2025-03-21 08:00:00', '2025-03-21 10:00:00', '2025-03-20 22:30:00'),
  (11, 'TKT-2025-00011', 'Transfer Voucher - 1x Armoured Vehicle', 'Transfer of 1x BMP-2 ICV (BA No. RR-XXXXX) from 21 Mech Inf to EME Workshop for Category B repair. Movement order and technical inspection report attached.', 'transfer_voucher', 'pending_validation', 'high', 'normal', 14, 'Equipment', 'Vehicles', 'Equipment Transfer', 11, 2, 4, '21 Mech Inf', '2025-04-01', NULL, NULL, '2025-03-22 15:00:00'),
  (12, 'TKT-2025-00012', 'New laptop provisioning - 8 officers', 'Request provisioning of 8x laptops (ThinkPad T14s or equivalent) for newly posted officers. Require standard SOE image with office suite, email client, and VPN client pre-installed.', 'general', 'allocated', 'medium', 'normal', 9, 'Hardware', 'Laptop', NULL, 5, 1, 3, '14 Rajput', '2025-04-05', NULL, NULL, '2025-03-21 10:30:00'),
  (13, 'TKT-2025-00013', 'Email server intermittent outage', 'Exchange server experiencing intermittent connectivity issues since 0800 hrs. Users reporting delayed emails (15-30 min lag). Webmail showing 503 errors intermittently. Approx 200 users affected across formation.', 'general', 'in_progress', 'high', 'high', 2, 'Software', 'Email', NULL, 2, 1, 3, 'HQ G1 Branch', '2025-03-24', NULL, NULL, '2025-03-23 08:45:00'),
  (14, 'TKT-2025-00014', 'Preventive maintenance - UPS battery bank', 'Scheduled preventive maintenance for 20KVA UPS battery bank (Rack A1-A4) in Server Room A. 18-month cycle due. Need 4-hour maintenance window. Requesting approval for next available Sunday.', 'general', 'submitted', 'low', 'normal', 19, 'Infrastructure', 'Power', NULL, 3, 1, NULL, 'IT Division', '2025-04-15', NULL, NULL, '2025-03-22 09:00:00'),
  (15, 'TKT-2025-00015', 'Security incident - Unauthorized USB detected', 'Unauthorized USB device detected on workstation WS-HQ-042 in Operations Room at 1430 hrs. Device has been confiscated. Requesting forensic analysis and security review. Endpoint logs preserved.', 'general', 'in_progress', 'critical', 'critical', 6, 'Security', 'Incident Response', NULL, 2, 4, 9, 'HQ G1 Branch', '2025-03-24', NULL, NULL, '2025-03-23 14:45:00'),
  (16, 'TKT-2025-00016', 'Issue Voucher - 50x Ballistic Helmets', 'Request issue of 50x Ballistic Helmet (PASGT equivalent) for newly raised company. Indent form and authorization letter from CO attached.', 'issue_voucher', 'forwarded', 'medium', 'normal', 12, 'Equipment', 'Personal Protection', 'Equipment Issue', 12, 2, 4, '4 Grenadiers', '2025-04-15', NULL, NULL, '2025-03-21 14:00:00'),
  (17, 'TKT-2025-00017', 'Video conferencing system setup - Conference Room', 'Install and configure Poly Studio X50 video conferencing system in Conference Room Alpha. Need HDMI, network, and audio integration. Room dimensions: 8m x 6m, seating for 20.', 'general', 'resolved', 'medium', 'normal', 1, 'Hardware', 'AV Equipment', NULL, 5, 1, 3, '14 Rajput', '2025-03-22', '2025-03-22 11:00:00', NULL, '2025-03-19 10:00:00'),
  (18, 'TKT-2025-00018', 'Deposit Voucher - 100x Sleeping Bags', 'Deposit of 100x Arctic Sleeping Bags post Operation SNOW LEOPARD. All items cleaned and inspected. 3 units require repair (Cat B). Deposit voucher and inspection certificate attached.', 'deposit_voucher', 'resolved', 'low', 'normal', 13, 'Equipment', 'Field Stores', 'Equipment Deposit', 6, 2, 4, '9 Para SF', '2025-03-25', '2025-03-24 09:00:00', NULL, '2025-03-22 16:00:00'),
  (19, 'TKT-2025-00019', 'Domain controller replication failure', 'AD replication between DC-PRIMARY and DC-SECONDARY failing with error 1722 (RPC server unavailable). Last successful replication: 48 hrs ago. Affecting new user provisioning and GPO updates.', 'general', 'awaiting_response', 'high', 'high', 2, 'Software', 'Active Directory', NULL, 3, 1, 3, 'IT Division', '2025-03-25', NULL, NULL, '2025-03-22 06:00:00'),
  (20, 'TKT-2025-00020', 'Classified document printer access', 'Request to add 3 new users to classified document printing group. Users: Lt. Col. Rajan, Maj. Khanna, Capt. Pillai. Security clearance verification attached for all three.', 'general', 'closed', 'medium', 'normal', 6, 'Security', 'Access Control', NULL, 14, 4, 9, 'HQ G1 Branch', '2025-03-22', '2025-03-21 15:00:00', '2025-03-21 17:00:00', '2025-03-20 09:00:00'),
  (21, 'TKT-2025-00021', 'Transfer Voucher - Comm Equipment to Sig Regt', 'Transfer of 15x HF Radio Set (Type 138) from 14 Rajput to Sig Regt for annual overhaul and calibration. Equipment list and condition report attached.', 'transfer_voucher', 'in_progress', 'medium', 'normal', 14, 'Communications', 'HF Radio', 'Equipment Transfer', 5, 6, 13, '14 Rajput', '2025-04-10', NULL, NULL, '2025-03-21 11:00:00'),
  (22, 'TKT-2025-00022', 'CCTV system malfunction - Gate 3', 'CCTV Camera #14 and #15 at Main Gate 3 showing no feed since 0200 hrs. NVR recording shows last frame at 0158 hrs. Possible power supply or cable fault. Security patrol increased as interim measure.', 'general', 'allocated', 'high', 'high', 1, 'Security', 'Surveillance', NULL, 9, 4, 9, 'Security Cell', '2025-03-24', NULL, NULL, '2025-03-23 06:00:00'),
  (23, 'TKT-2025-00023', 'Deposit Voucher - Vehicle batteries', 'Deposit of 20x Vehicle Battery (12V 120AH) to Central Workshop. 12 serviceable, 8 BER. BER board proceedings attached. Request disposal authorization for BER items.', 'deposit_voucher', 'pending_documents', 'low', 'normal', 13, 'Equipment', 'Vehicles', 'Equipment Deposit', 12, 2, 4, '4 Grenadiers', '2025-04-05', NULL, NULL, '2025-03-22 13:00:00'),
  (24, 'TKT-2025-00024', 'Satellite terminal link degradation', 'VSAT terminal showing degraded signal (SNR dropped from 12dB to 4dB). Throughput reduced from 2Mbps to 200kbps. Affecting data connectivity to remote detachment. Weather clear - suspected antenna misalignment.', 'general', 'submitted', 'high', 'high', 17, 'Communications', 'SATCOM', NULL, 11, 3, NULL, '21 Mech Inf', '2025-03-25', NULL, NULL, '2025-03-23 10:00:00'),
  (25, 'TKT-2025-00025', 'Annual IT asset audit - Q1 report', 'Compile and submit Q1 FY2025-26 IT asset audit report. Include all desktops, laptops, printers, servers, network equipment. Discrepancies from last audit to be reconciled. Deadline: 31 Mar 2025.', 'general', 'draft', 'medium', 'normal', 1, 'Administration', 'Audit', NULL, 8, NULL, NULL, 'HQ Inspectorate', '2025-03-31', NULL, NULL, '2025-03-23 09:30:00');

-- Rich comments thread
INSERT OR IGNORE INTO comments (id, ticket_id, user_id, content, is_internal, created_at) VALUES
  (1, 1, 7, 'Dispatched team to Building C. Initial assessment: fiber optic cable damage at distribution panel DP-C2. Appears to be physical damage from recent construction activity.', 0, '2025-03-20 07:45:00'),
  (2, 1, 7, 'Replacement splice kit procured from stores. ETA for repair: 4 hours. Will need to take down adjacent links briefly during splicing.', 0, '2025-03-20 08:30:00'),
  (3, 1, 3, 'Internal: Confirmed this is related to construction work near Building C reported last week (REF: TKT-2025-00XXX). Need to escalate to Garrison Engineer to prevent recurrence.', 1, '2025-03-20 09:00:00'),
  (4, 1, 5, 'How long will the outage continue? We have a critical video conference scheduled at 1400 hrs today.', 0, '2025-03-20 09:30:00'),
  (5, 1, 7, 'Splicing completed on 4 of 6 affected fibers. Estimated full restoration by 1200 hrs. Can arrange temporary wireless link for your VC if needed.', 0, '2025-03-20 10:15:00'),
  (6, 2, 4, 'Documents received. Verifying authorization letter serial and indent form against holding ledger. Will cross-check with CFA approval register.', 0, '2025-03-21 10:00:00'),
  (7, 2, 4, 'Authorization verified. Indent quantity (10 units) matches allocation under OP TRISHUL SHAKTI. CFA approval no. CFA/2025/0892. Processing issue voucher for signature.', 0, '2025-03-21 14:30:00'),
  (8, 2, 6, 'Thank you. Please confirm expected date of physical handover. We need to arrange transport and security escort.', 0, '2025-03-21 15:00:00'),
  (9, 3, 2, 'Ticket received at G1 desk. Forwarding to MISO Cell for validation of transfer documents and movement order verification.', 0, '2025-03-22 11:00:00'),
  (10, 3, 14, 'Movement order MO/2025/347 verified against records. Transfer voucher format appears correct. Forwarding to MISO for equipment ledger update.', 0, '2025-03-22 12:00:00'),
  (11, 4, 3, 'ALIS v3.2 installation media and license keys received from vendor. Will schedule deployment after checking workstation compatibility (min 8GB RAM, 256GB SSD required).', 0, '2025-03-22 16:00:00'),
  (12, 5, 9, 'Security clearance verification initiated for Lt. Col. Rajan. Awaiting confirmation from Records Office. Expected turnaround: 48-72 hours.', 0, '2025-03-23 09:00:00'),
  (13, 6, 3, 'Printer inspected. Pickup roller worn out causing false paper jam sensor trigger. Replaced pickup roller assembly and cleaned all sensors. Test prints successful - 50 pages without error.', 0, '2025-03-21 16:00:00'),
  (14, 6, 12, 'Confirmed printer is working fine now. Thank you for the quick resolution.', 0, '2025-03-21 17:00:00'),
  (15, 7, 4, 'All 5x NVD units received and physically inspected. Serial numbers match documentation. Running functional test on each unit before updating holding ledger.', 0, '2025-03-22 14:00:00'),
  (16, 7, 4, 'Internal: Unit 3 (SN: NVD-2019-0847) has scratched lens. Marking for lens replacement before return to general pool. Other 4 units are serviceable.', 1, '2025-03-22 15:30:00'),
  (17, 8, 7, 'IPSec logs show IKE Phase 1 succeeding but Phase 2 failing with "no proposal chosen". Possible SA mismatch after recent firewall firmware update on FOB side. Coordinating with FOB network admin.', 0, '2025-03-23 05:00:00'),
  (18, 8, 7, 'Identified issue: FOB firewall was updated and encryption proposal changed from AES-256 to AES-128. Reconfiguring to match. Tunnel should be back in 30 minutes.', 0, '2025-03-23 06:30:00'),
  (19, 10, 3, 'Emergency repair team dispatched. Compressor unit found failed. Portable AC units deployed as temporary measure. Room temperature stabilized at 24C. Permanent replacement unit ordered (48hr delivery).', 0, '2025-03-21 02:00:00'),
  (20, 10, 3, 'New 5-ton AC unit installed and commissioned. Room temperature now at 20C. Old unit sent for repair assessment. Monitoring for 24 hours.', 0, '2025-03-21 07:30:00'),
  (21, 13, 3, 'Exchange services restarted. Information Store was consuming 98% memory. Applied hotfix KB5023456. Monitoring for next 2 hours.', 0, '2025-03-23 10:00:00'),
  (22, 13, 3, 'Internal: This is the 3rd Exchange outage this quarter. Recommending migration to newer version in next maintenance window. Escalating to IT Head for approval.', 1, '2025-03-23 11:00:00'),
  (23, 15, 9, 'USB device secured in evidence bag (Evidence #SEC-2025-0034). Initial scan shows the device contains no malware but has unauthorized documents. Full forensic analysis in progress using local forensic workstation.', 0, '2025-03-23 15:30:00'),
  (24, 15, 9, 'Internal: Device belongs to a contractor. Badge records show contractor was in Operations Room from 1400-1445 hrs. Notifying security branch for further investigation.', 1, '2025-03-23 16:00:00'),
  (25, 17, 3, 'Poly Studio X50 installed and configured. Room calibrated for optimal audio pickup. HDMI, USB-C, and wireless presentation modes tested. User guide left with room coordinator.', 0, '2025-03-22 10:30:00'),
  (26, 18, 4, 'All 100 sleeping bags received and inspected. 97 units graded serviceable. 3 units (SN: SB-2021-0445, 0467, 0512) marked for repair - torn outer shell. Holding ledger updated.', 0, '2025-03-24 08:30:00'),
  (27, 19, 3, 'Checked RPC connectivity - ports 135, 49152-65535 are open. DNS resolution between DCs is correct. Suspecting NTP time skew causing Kerberos auth failure. Checking time sync.', 0, '2025-03-22 10:00:00'),
  (28, 19, 3, 'Confirmed: 7-minute time drift between DCs. Synced to internal NTP server. Forced replication with repadmin /syncall. Awaiting confirmation of full sync completion.', 0, '2025-03-22 14:00:00'),
  (29, 21, 13, 'All 15x HF Radio Sets received at Sig Regt workshop. Physical inspection completed. 12 units are Cat A, 3 units require component-level repair. Calibration schedule: 5 units per week.', 0, '2025-03-22 09:00:00'),
  (30, 23, 4, 'Deposit voucher reviewed. BER board proceedings for 8 batteries are incomplete - missing disposal authorization from COS. Please provide updated BER board proceedings with all required signatures.', 0, '2025-03-23 09:00:00');

-- Rich audit log
INSERT OR IGNORE INTO audit_log (id, entity_type, entity_id, action, user_id, details, created_at) VALUES
  (1, 'ticket', 1, 'created', 5, 'Ticket TKT-2025-00001 created - Network connectivity failure', '2025-03-20 06:30:00'),
  (2, 'ticket', 1, 'status_changed', 2, 'Status: submitted -> allocated', '2025-03-20 07:00:00'),
  (3, 'ticket', 1, 'assigned', 2, 'Assigned to Network Team / Hav. Kumar', '2025-03-20 07:00:00'),
  (4, 'ticket', 1, 'status_changed', 7, 'Status: allocated -> in_progress', '2025-03-20 07:45:00'),
  (5, 'ticket', 1, 'comment_added', 7, 'Comment added with initial assessment', '2025-03-20 07:45:00'),
  (6, 'ticket', 2, 'created', 6, 'Ticket TKT-2025-00002 created - Issue Voucher Radio Sets', '2025-03-21 09:00:00'),
  (7, 'ticket', 2, 'status_changed', 2, 'Status: submitted -> pending_validation', '2025-03-21 09:30:00'),
  (8, 'ticket', 2, 'assigned', 2, 'Assigned to MISO Operations / Lt. Col. Verma', '2025-03-21 09:30:00'),
  (9, 'ticket', 3, 'created', 5, 'Ticket TKT-2025-00003 created - Transfer Generator Sets', '2025-03-22 10:15:00'),
  (10, 'ticket', 4, 'created', 6, 'Ticket TKT-2025-00004 created - ALIS Installation', '2025-03-22 14:00:00'),
  (11, 'ticket', 4, 'status_changed', 2, 'Status: submitted -> allocated', '2025-03-22 14:30:00'),
  (12, 'ticket', 4, 'assigned', 2, 'Assigned to IT Support / Maj. Singh', '2025-03-22 14:30:00'),
  (13, 'ticket', 5, 'created', 5, 'Ticket TKT-2025-00005 created - SCI Terminal Access', '2025-03-23 08:00:00'),
  (14, 'ticket', 5, 'assigned', 14, 'Assigned to Security Team / Maj. Kapoor', '2025-03-23 08:30:00'),
  (15, 'ticket', 6, 'created', 12, 'Ticket TKT-2025-00006 created - Printer Malfunction', '2025-03-20 11:00:00'),
  (16, 'ticket', 6, 'status_changed', 3, 'Status: in_progress -> resolved', '2025-03-21 16:30:00'),
  (17, 'ticket', 7, 'created', 11, 'Ticket TKT-2025-00007 created - NVD Deposit', '2025-03-22 08:30:00'),
  (18, 'ticket', 8, 'created', 11, 'Ticket TKT-2025-00008 created - VPN Tunnel Down', '2025-03-23 04:15:00'),
  (19, 'ticket', 8, 'status_changed', 7, 'Status: allocated -> in_progress', '2025-03-23 05:00:00'),
  (20, 'ticket', 9, 'created', 12, 'Ticket TKT-2025-00009 created - Camouflage Nets', '2025-03-23 07:00:00'),
  (21, 'ticket', 10, 'created', 3, 'Ticket TKT-2025-00010 created - Server Room AC Failure', '2025-03-20 22:30:00'),
  (22, 'ticket', 10, 'status_changed', 3, 'Status: in_progress -> resolved', '2025-03-21 08:00:00'),
  (23, 'ticket', 10, 'status_changed', 1, 'Status: resolved -> closed', '2025-03-21 10:00:00'),
  (24, 'ticket', 11, 'created', 11, 'Ticket TKT-2025-00011 created - BMP-2 Transfer', '2025-03-22 15:00:00'),
  (25, 'ticket', 15, 'created', 2, 'Ticket TKT-2025-00015 created - SECURITY INCIDENT - Unauthorized USB', '2025-03-23 14:45:00'),
  (26, 'ticket', 15, 'status_changed', 9, 'Status: allocated -> in_progress (PRIORITY ESCALATION)', '2025-03-23 15:00:00'),
  (27, 'ticket', 20, 'created', 14, 'Ticket TKT-2025-00020 created - Classified Printer Access', '2025-03-20 09:00:00'),
  (28, 'ticket', 20, 'status_changed', 9, 'Status: in_progress -> resolved', '2025-03-21 15:00:00'),
  (29, 'ticket', 20, 'status_changed', 14, 'Status: resolved -> closed', '2025-03-21 17:00:00'),
  (30, 'user', 1, 'login', 1, 'System Administrator login from HQ terminal', '2025-03-23 08:00:00');

-- Notifications
INSERT OR IGNORE INTO notifications (id, user_id, title, message, read, ticket_id, created_at) VALUES
  (1, 5, 'Ticket Update', 'Your ticket TKT-2025-00001 is now in progress. Network Team is working on the fiber repair.', 0, 1, '2025-03-20 07:45:00'),
  (2, 6, 'Document Verification', 'Your issue voucher TKT-2025-00002 is under validation by MISO Cell.', 0, 2, '2025-03-21 10:00:00'),
  (3, 7, 'New Assignment', 'You have been assigned to ticket TKT-2025-00001 - Network connectivity failure.', 1, 1, '2025-03-20 07:00:00'),
  (4, 4, 'New Assignment', 'You have been assigned to ticket TKT-2025-00002 - Issue Voucher Radio Sets.', 1, 2, '2025-03-21 09:30:00'),
  (5, 5, 'Status Update', 'Ticket TKT-2025-00003 has been received by G1 and forwarded to MISO.', 0, 3, '2025-03-22 11:00:00'),
  (6, 12, 'Ticket Resolved', 'Your ticket TKT-2025-00006 (Printer malfunction) has been resolved.', 0, 6, '2025-03-21 16:30:00'),
  (7, 11, 'Deposit Update', 'Your deposit voucher TKT-2025-00007 is being processed. NVDs under inspection.', 0, 7, '2025-03-22 14:00:00'),
  (8, 3, 'Critical Alert', 'New critical ticket: TKT-2025-00008 - VPN tunnel to FOB is down.', 0, 8, '2025-03-23 04:15:00'),
  (9, 9, 'Security Incident', 'URGENT: Security incident TKT-2025-00015 assigned to you. Unauthorized USB device detected.', 0, 15, '2025-03-23 14:50:00'),
  (10, 12, 'Documents Required', 'Additional documents needed for TKT-2025-00023 (Vehicle batteries deposit). Please upload updated BER proceedings.', 0, 23, '2025-03-23 09:00:00'),
  (11, 5, 'Comment Added', 'New comment on TKT-2025-00001 from Hav. Kumar regarding repair progress.', 0, 1, '2025-03-20 10:15:00'),
  (12, 6, 'Voucher Update', 'Authorization verified for TKT-2025-00002. Issue voucher being processed.', 0, 2, '2025-03-21 14:30:00');
`;

async function saveDb() {
  if (db) {
    const data = db.export();
    await set(DB_KEY, data);
  }
}

export async function resetDatabase(): Promise<void> {
  db = null;
  dbReady = null;
  await del(DB_KEY);
  await del(DB_VERSION_KEY);
  localStorage.removeItem('current_user');
}

export async function getDb(): Promise<Database> {
  if (dbReady) return dbReady;

  dbReady = (async () => {
    try {
      const SQL = await initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
      });

      // Check version - if schema changed, reset
      const storedVersion = await get(DB_VERSION_KEY);
      if (storedVersion !== CURRENT_VERSION) {
        await del(DB_KEY);
        await set(DB_VERSION_KEY, CURRENT_VERSION);
      }

      const savedData = await get(DB_KEY);
      if (savedData) {
        db = new SQL.Database(new Uint8Array(savedData as ArrayBuffer));
        db.run(SCHEMA);
      } else {
        db = new SQL.Database();
        db.run(SCHEMA);
        db.run(SEED);
        await saveDb();
      }

      return db;
    } catch (error) {
      console.error('Database initialization failed:', error);
      dbReady = null;
      throw error;
    }
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
