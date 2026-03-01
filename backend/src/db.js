import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data.sqlite');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    worker_id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workstations (
    station_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    station_type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_hash TEXT UNIQUE,
    timestamp TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    workstation_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    confidence REAL,
    count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(worker_id) REFERENCES workers(worker_id),
    FOREIGN KEY(workstation_id) REFERENCES workstations(station_id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_worker_time ON ai_events(worker_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_station_time ON ai_events(workstation_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_type ON ai_events(event_type);
`);

const sampleWorkers = [
  ['W1', 'Aisha Patel'],
  ['W2', 'Abhi Kumar'],
  ['W3', 'Priya Nair'],
  ['W4', 'Ram yadav'],
  ['W5', 'Mukesh kumar'],
  ['W6', 'pratap dhar']
];

const sampleStations = [
  ['S1', 'Assembly Alpha', 'assembly'],
  ['S2', 'Assembly Beta', 'assembly'],
  ['S3', 'Welding Cell', 'welding'],
  ['S4', 'Inspection Bay', 'inspection'],
  ['S5', 'Packaging Lane', 'packaging'],
  ['S6', 'Material Prep', 'prep']
];

const statuses = ['working', 'idle', 'absent'];

function eventHash(event) {
  return `${event.timestamp}|${event.worker_id}|${event.workstation_id}|${event.event_type}|${event.count ?? 0}`;
}

export function seedBaseData() {
  const workerStmt = db.prepare('INSERT OR IGNORE INTO workers(worker_id, name) VALUES (?, ?)');
  const stationStmt = db.prepare('INSERT OR IGNORE INTO workstations(station_id, name, station_type) VALUES (?, ?, ?)');

  const tx = db.transaction(() => {
    sampleWorkers.forEach(([id, name]) => workerStmt.run(id, name));
    sampleStations.forEach(([id, name, type]) => stationStmt.run(id, name, type));
  });

  tx();
}

function createDummyEvents() {
  const start = new Date('2026-01-15T08:00:00Z');
  const events = [];

  for (let minute = 0; minute < 8 * 60; minute += 15) {
    const time = new Date(start.getTime() + minute * 60000).toISOString();

    sampleWorkers.forEach(([workerId], idx) => {
      const stationId = sampleStations[(idx + Math.floor(minute / 60)) % sampleStations.length][0];
      const status = statuses[(Math.floor(minute / 15) + idx) % statuses.length];
      const confidence = 0.83 + ((idx + minute / 15) % 9) * 0.015;

      events.push({
        timestamp: time,
        worker_id: workerId,
        workstation_id: stationId,
        event_type: status,
        confidence: Number(confidence.toFixed(2)),
        count: 0
      });

      if (status === 'working') {
        events.push({
          timestamp: time,
          worker_id: workerId,
          workstation_id: stationId,
          event_type: 'product_count',
          confidence: Number((confidence - 0.04).toFixed(2)),
          count: 1 + ((idx + minute / 30) % 4)
        });
      }
    });
  }

  return events;
}

export function clearEvents() {
  db.prepare('DELETE FROM ai_events').run();
}

export function seedDummyEvents() {
  seedBaseData();
  clearEvents();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO ai_events(event_hash, timestamp, worker_id, workstation_id, event_type, confidence, count)
    VALUES (@event_hash, @timestamp, @worker_id, @workstation_id, @event_type, @confidence, @count)
  `);

  const events = createDummyEvents();
  const tx = db.transaction((batch) => {
    batch.forEach((event) => {
      insert.run({ ...event, event_hash: eventHash(event) });
    });
  });

  tx(events);

  return { inserted: events.length };
}

export function insertEvents(events) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO ai_events(event_hash, timestamp, worker_id, workstation_id, event_type, confidence, count)
    VALUES (@event_hash, @timestamp, @worker_id, @workstation_id, @event_type, @confidence, @count)
  `);

  const tx = db.transaction((incoming) => {
    let inserted = 0;
    incoming.forEach((event) => {
      const result = insert.run({
        event_hash: eventHash(event),
        timestamp: event.timestamp,
        worker_id: event.worker_id,
        workstation_id: event.workstation_id,
        event_type: event.event_type,
        confidence: event.confidence ?? null,
        count: event.count ?? 0
      });
      inserted += result.changes;
    });
    return inserted;
  });

  return tx(events);
}

export function getWorkers() {
  return db.prepare('SELECT * FROM workers ORDER BY worker_id').all();
}

export function getStations() {
  return db.prepare('SELECT * FROM workstations ORDER BY station_id').all();
}
