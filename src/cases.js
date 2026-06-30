/**
 * Case management — user's own cases, tasks/checklists, timeline events.
 * Stored locally in SQLite alongside the legal corpus.
 */
import { getDb } from './db.js';

// ── Schema ─────────────────────────────────────────────────────────────────────
export function initCasesTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_cases (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL,
      court         TEXT,
      matter_number TEXT,
      area_of_law   TEXT,
      jurisdiction  TEXT    DEFAULT 'nsw',
      status        TEXT    DEFAULT 'active',
      next_date     TEXT,
      notes         TEXT,
      created_at    TEXT    DEFAULT (datetime('now')),
      updated_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS case_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id     INTEGER NOT NULL REFERENCES user_cases(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      description TEXT,
      category    TEXT    DEFAULT 'action',
      due_date    TEXT,
      done        INTEGER DEFAULT 0,
      priority    INTEGER DEFAULT 2,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS case_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id     INTEGER NOT NULL REFERENCES user_cases(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      description TEXT,
      event_type  TEXT    DEFAULT 'note',
      event_date  TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS case_documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id     INTEGER NOT NULL REFERENCES user_cases(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      doc_type    TEXT    DEFAULT 'evidence',
      status      TEXT    DEFAULT 'need',
      notes       TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);
}

// ── Task templates per area of law ─────────────────────────────────────────────
export const TASK_TEMPLATES = {
  tenancy: [
    { title:'Send formal demand letter to landlord', category:'action',  priority:1, description:'Write a letter demanding return of bond within 14 days, citing the relevant Residential Tenancies Act.' },
    { title:'Gather evidence of property condition', category:'evidence', priority:1, description:'Collect move-in/move-out photos, inspection reports, any written communications about property condition.' },
    { title:'Lodge claim with tribunal (NCAT/VCAT)', category:'filing',  priority:1, description:'File application for bond dispute with your state tribunal. NSW: NCAT, VIC: VCAT, QLD: QCAT.' },
    { title:'Serve application on respondent',        category:'legal',   priority:1, description:'Formally serve the application on the other party within the required timeframe.' },
    { title:'File evidence bundle',                   category:'filing',  priority:2, description:'Compile all evidence: photos, receipts, correspondence, lease agreement, condition reports.' },
    { title:'Research similar decided cases',         category:'research',priority:2, description:'Use the case law search to find similar bond/tenancy disputes decided in your state.' },
    { title:'Prepare your submissions',               category:'action',  priority:2, description:'Write out what you will say at the hearing — what happened, what you want, why you are entitled to it.' },
    { title:'Attend mediation/conciliation',          category:'hearing', priority:2, description:'Be on time. Bring all evidence. Focus on facts and your legal rights, not emotions.' },
    { title:'Attend hearing',                         category:'hearing', priority:1, description:'Bring 3 copies of all documents. Speak clearly. Address the member as "Member" not "Your Honour".' },
  ],
  employment: [
    { title:'Check if eligible for unfair dismissal', category:'research',priority:1, description:'You must have been employed 6+ months (1yr for small business), dismissed (not resigned), and not covered by an excluded reason.' },
    { title:'File Form F2 — Unfair Dismissal',        category:'filing',  priority:1, description:'MUST be filed within 21 days of dismissal. Late applications rarely succeed. File at fwc.gov.au.' },
    { title:'Gather evidence of dismissal',            category:'evidence',priority:1, description:'Termination letter, payslips, performance reviews, emails about your dismissal, text messages.' },
    { title:'Attend conciliation',                    category:'hearing', priority:1, description:'Compulsory first step. Be realistic — most cases settle here. Know your bottom line before you go.' },
    { title:'File witness statements',                category:'filing',  priority:2, description:'Statements from colleagues, supervisors, or others who witnessed relevant events.' },
    { title:'Prepare evidence bundle',                category:'filing',  priority:2, description:'Organised folder: employment contract, performance reviews, all communications, termination letter.' },
    { title:'Research similar FWC decisions',         category:'research',priority:2, description:'Search Fair Work Commission decisions on valid reason, procedural fairness, remedy calculations.' },
    { title:'Attend arbitration hearing',             category:'hearing', priority:1, description:'Formal hearing before a Commissioner. Present your case clearly. You can cross-examine their witnesses.' },
  ],
  family: [
    { title:'Attempt family dispute resolution (FDR)', category:'legal',  priority:1, description:'Required before filing parenting orders (unless urgency/safety). Get s60I certificate from mediator.' },
    { title:'File application — Family Law',           category:'filing', priority:1, description:'File at Federal Circuit & Family Court. Parenting: Form 1. Property: Form 1. Divorce: Form 3.' },
    { title:'Serve application on other party',        category:'legal',  priority:1, description:'Must be personally served (not by you — use a friend or process server). File proof of service.' },
    { title:'Prepare financial statement',             category:'filing', priority:2, description:'Complete Form 13 Financial Statement. Must be accurate — it is a sworn document.' },
    { title:'Gather financial evidence',               category:'evidence',priority:2,description:'Bank statements, tax returns, super statements, property valuations, mortgage statements.' },
    { title:'Research property settlement principles', category:'research',priority:2,description:'4-step process: identify assets/liabilities, assess contributions, future needs, just & equitable check.' },
    { title:'Attend first hearing (mention)',          category:'hearing', priority:1, description:'Administrative hearing. Court sets timetable. You confirm issues in dispute.' },
    { title:'File affidavit evidence',                category:'filing',  priority:1, description:'Sworn statement of facts. Focus on what happened, not your opinion. Attach supporting documents.' },
  ],
  consumer: [
    { title:'Contact trader formally in writing',     category:'action',  priority:1, description:'Send an email/letter requesting remedy (refund/repair/replace). Give 10-14 days to respond. Keep a copy.' },
    { title:'Lodge complaint with Fair Trading',      category:'filing',  priority:2, description:'NSW Fair Trading, Consumer Affairs VIC, etc. Free service. May resolve without tribunal.' },
    { title:'File claim with tribunal',               category:'filing',  priority:1, description:'NCAT Consumer & Commercial Division (NSW), VCAT (VIC). Low fees. No lawyers in some tiers.' },
    { title:'Gather evidence of purchase',            category:'evidence',priority:1, description:'Receipt/invoice, photos of defect, emails with trader, expert report if needed.' },
    { title:'Research Australian Consumer Law rights',category:'research',priority:2, description:'Look up: major failure, consumer guarantee, misleading conduct under ACL sch 2 CCA 2010.' },
    { title:'Calculate your loss',                    category:'action',  priority:2, description:'Document exact financial loss: purchase price, repair costs, consequential losses.' },
    { title:'Attend hearing',                         category:'hearing', priority:1, description:'Bring all receipts, photos, correspondence. Know the ACL sections that apply to your situation.' },
  ],
  injury: [
    { title:'Get medical treatment and documentation', category:'evidence',priority:1, description:'See a doctor IMMEDIATELY. Every injury must be documented. Keep all medical records.' },
    { title:'Report the incident',                    category:'action',  priority:1, description:'Report to police (if relevant), employer (workers comp), or venue/council (public liability).' },
    { title:'Photograph everything',                  category:'evidence',priority:1, description:'Scene, injuries, hazards, vehicles. Time-stamp photos. Get witness names and contacts.' },
    { title:'Check limitation period',                category:'legal',   priority:1, description:'NSW: 3 years from date of knowledge. STRICT — claim is barred after this. Get advice urgently.' },
    { title:'Gather evidence of negligence',          category:'evidence',priority:1, description:'Who owed you a duty? Did they breach it? Did the breach cause your injury? Evidence for each.' },
    { title:'Obtain expert medical report',           category:'evidence',priority:2, description:'A medico-legal report assessing permanent impairment is usually required for compensation claims.' },
    { title:'Calculate economic loss',                category:'action',  priority:2, description:'Past and future lost income, medical expenses, domestic assistance, pain and suffering.' },
    { title:'Lodge formal claim / file proceedings', category:'filing',  priority:1, description:'Workers comp: lodge with insurer. Personal injury: CARS assessment (NSW) then District/Supreme Court.' },
  ],
  criminal: [
    { title:'Get legal advice urgently',              category:'legal',   priority:1, description:'Contact Legal Aid (1300 888 529), Community Legal Centre, or a criminal lawyer immediately.' },
    { title:'Write down everything you remember',     category:'evidence',priority:1, description:'Your version of events, witnesses present, what police said and did. Do this BEFORE speaking to anyone.' },
    { title:'Understand the charge',                  category:'research',priority:1, description:'Get the exact charge(s) in writing. Look up the element of the offence — what must be proven beyond reasonable doubt.' },
    { title:'Bail application (if in custody)',       category:'legal',   priority:1, description:'File bail application immediately. Must show unacceptable risk test not met. Propose conditions.' },
    { title:'Get criminal antecedents report',        category:'legal',   priority:2, description:'Request your criminal record — the prosecution will use it and you need to know what they have.' },
    { title:'Review police brief of evidence',        category:'evidence',priority:1, description:'Request the police brief/disclosures. Scrutinise every document. Look for inconsistencies.' },
    { title:'Identify witnesses',                     category:'evidence',priority:2, description:'People who can give evidence supporting your version. Contact them and preserve their recollection.' },
    { title:'Consider plea options',                  category:'legal',   priority:2, description:'Understand the sentencing discount for early guilty plea vs cost of a defended hearing.' },
    { title:'Prepare submissions on sentence (if pleading guilty)', category:'action', priority:2, description:'Character references, evidence of rehabilitation, mitigating circumstances.' },
  ],
  immigration: [
    { title:'Read the decision letter carefully',     category:'research',priority:1, description:'Understand exactly why your visa was refused/cancelled. The reasons determine your appeal strategy.' },
    { title:'Check appeal deadline (21 days from AAT)', category:'legal',  priority:1, description:'Lodge AAT application within 21 days of the decision. This is a hard deadline.' },
    { title:'Lodge AAT appeal',                       category:'filing',  priority:1, description:'File online at aat.gov.au. Pay lodgment fee (waiver may be available). Include all documents.' },
    { title:'Gather evidence addressing refusal reasons', category:'evidence',priority:1, description:'Get documents that specifically counter each reason for refusal.' },
    { title:'Research similar AAT decisions',         category:'research',priority:2, description:'Search for AAT decisions on the same visa subclass and similar factual circumstances.' },
    { title:'Prepare statement of facts',             category:'filing',  priority:2, description:'Written statement explaining your circumstances and why you meet the visa criteria.' },
    { title:'Attend AAT hearing',                     category:'hearing', priority:1, description:'The AAT reviews the decision on its merits. You can give evidence and present witnesses.' },
  ],
};

// ── CRUD operations ────────────────────────────────────────────────────────────

export function getCases() {
  const db = getDb();
  const cases = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM case_tasks WHERE case_id=c.id) AS total_tasks,
      (SELECT COUNT(*) FROM case_tasks WHERE case_id=c.id AND done=1) AS done_tasks,
      (SELECT MIN(due_date) FROM case_tasks WHERE case_id=c.id AND done=0 AND due_date IS NOT NULL) AS next_deadline
    FROM user_cases c ORDER BY c.status='active' DESC, c.updated_at DESC
  `).all();
  return cases;
}

export function getCase(id) {
  const db = getDb();
  const c = db.prepare('SELECT * FROM user_cases WHERE id=?').get(id);
  if (!c) return null;
  c.tasks  = db.prepare('SELECT * FROM case_tasks  WHERE case_id=? ORDER BY done ASC, priority ASC, due_date ASC').all(id);
  c.events = db.prepare('SELECT * FROM case_events WHERE case_id=? ORDER BY event_date ASC, created_at DESC').all(id);
  c.documents = db.prepare('SELECT * FROM case_documents WHERE case_id=? ORDER BY created_at ASC').all(id);
  return c;
}

export function createCase(data) {
  const db = getDb();
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO user_cases (title,court,matter_number,area_of_law,jurisdiction,status,next_date,notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(data.title, data.court||'', data.matter_number||'', data.area_of_law||'', data.jurisdiction||'nsw', data.status||'active', data.next_date||null, data.notes||'');

  // Add template tasks for the area
  if (data.area_of_law && TASK_TEMPLATES[data.area_of_law]) {
    const insert = db.prepare('INSERT INTO case_tasks (case_id,title,description,category,priority) VALUES (?,?,?,?,?)');
    for (const t of TASK_TEMPLATES[data.area_of_law]) {
      insert.run(id, t.title, t.description||'', t.category||'action', t.priority||2);
    }
  }

  // Add creation event
  db.prepare('INSERT INTO case_events (case_id,title,event_type,event_date) VALUES (?,?,?,?)').run(id, 'Case opened', 'milestone', new Date().toISOString().slice(0,10));
  if (data.next_date) {
    db.prepare('INSERT INTO case_events (case_id,title,event_type,event_date) VALUES (?,?,?,?)').run(id, 'Next court date', 'hearing', data.next_date);
  }

  return getCase(id);
}

export function updateCase(id, data) {
  const db = getDb();
  db.prepare(`UPDATE user_cases SET title=?,court=?,matter_number=?,area_of_law=?,jurisdiction=?,status=?,next_date=?,notes=?,updated_at=datetime('now') WHERE id=?`)
    .run(data.title, data.court||'', data.matter_number||'', data.area_of_law||'', data.jurisdiction||'nsw', data.status||'active', data.next_date||null, data.notes||'', id);
  return getCase(id);
}

export function deleteCase(id) {
  getDb().prepare('DELETE FROM user_cases WHERE id=?').run(id);
}

export function upsertTask(caseId, task) {
  const db = getDb();
  if (task.id) {
    db.prepare('UPDATE case_tasks SET title=?,description=?,category=?,due_date=?,done=?,priority=? WHERE id=? AND case_id=?')
      .run(task.title, task.description||'', task.category||'action', task.due_date||null, task.done?1:0, task.priority||2, task.id, caseId);
    db.prepare("UPDATE user_cases SET updated_at=datetime('now') WHERE id=?").run(caseId);
  } else {
    db.prepare('INSERT INTO case_tasks (case_id,title,description,category,due_date,priority) VALUES (?,?,?,?,?,?)')
      .run(caseId, task.title, task.description||'', task.category||'action', task.due_date||null, task.priority||2);
    db.prepare("UPDATE user_cases SET updated_at=datetime('now') WHERE id=?").run(caseId);
  }
}

export function deleteTask(id) {
  getDb().prepare('DELETE FROM case_tasks WHERE id=?').run(id);
}

export function addEvent(caseId, event) {
  getDb().prepare('INSERT INTO case_events (case_id,title,description,event_type,event_date) VALUES (?,?,?,?,?)')
    .run(caseId, event.title, event.description||'', event.event_type||'note', event.event_date||null);
  getDb().prepare("UPDATE user_cases SET updated_at=datetime('now') WHERE id=?").run(caseId);
}

export function deleteEvent(id) {
  getDb().prepare('DELETE FROM case_events WHERE id=?').run(id);
}

export function addDocument(caseId, doc) {
  getDb().prepare('INSERT INTO case_documents (case_id,title,doc_type,status,notes) VALUES (?,?,?,?,?)')
    .run(caseId, doc.title, doc.doc_type||'evidence', doc.status||'need', doc.notes||'');
}

export function toggleDocument(id) {
  const db = getDb();
  const d = db.prepare('SELECT status FROM case_documents WHERE id=?').get(id);
  const next = d?.status === 'have' ? 'need' : 'have';
  db.prepare('UPDATE case_documents SET status=? WHERE id=?').run(next, id);
}

export function deleteDocument(id) {
  getDb().prepare('DELETE FROM case_documents WHERE id=?').run(id);
}
