import express from 'express';
import cors from 'cors';
import { computeMetrics } from './metrics.js';
import { getStations, getWorkers, insertEvents, seedBaseData, seedDummyEvents } from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

seedBaseData();
if (process.env.SEED_ON_START !== 'false') {
  seedDummyEvents();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/metadata', (_req, res) => {
  res.json({ workers: getWorkers(), workstations: getStations() });
});

app.post('/api/events', (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : [req.body];

  const validTypes = new Set(['working', 'idle', 'absent', 'product_count']);
  const errors = [];

  incoming.forEach((event, idx) => {
    if (!event?.timestamp || Number.isNaN(Date.parse(event.timestamp))) errors.push(`event[${idx}] invalid timestamp`);
    if (!event?.worker_id) errors.push(`event[${idx}] missing worker_id`);
    if (!event?.workstation_id) errors.push(`event[${idx}] missing workstation_id`);
    if (!validTypes.has(event?.event_type)) errors.push(`event[${idx}] invalid event_type`);
    if (event?.event_type === 'product_count' && (event.count == null || Number(event.count) < 0)) {
      errors.push(`event[${idx}] product_count requires non-negative count`);
    }
  });

  if (errors.length) return res.status(400).json({ errors });

  const inserted = insertEvents(
    incoming.map((event) => ({
      timestamp: new Date(event.timestamp).toISOString(),
      worker_id: event.worker_id,
      workstation_id: event.workstation_id,
      event_type: event.event_type,
      confidence: event.confidence ?? null,
      count: Number(event.count ?? 0)
    }))
  );

  return res.status(201).json({ received: incoming.length, inserted, duplicates_ignored: incoming.length - inserted });
});

app.post('/api/seed', (_req, res) => {
  const result = seedDummyEvents();
  res.json({ message: 'Dummy data loaded', ...result });
});

app.get('/api/metrics', (req, res) => {
  const metrics = computeMetrics({
    workerId: req.query.worker_id || undefined,
    stationId: req.query.station_id || undefined
  });

  res.json(metrics);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
