# AI-Powered Worker Productivity Dashboard

Production-style full-stack dashboard for ingesting AI CCTV events and computing worker/workstation/factory productivity metrics.

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** SQLite (`better-sqlite3`)
- **Frontend:** React + Vite
- **Containerization:** Docker + docker-compose

## Architecture (Edge → Backend → Dashboard)
1. **Edge (AI CCTV / CV models)** emits structured JSON events (`working`, `idle`, `absent`, `product_count`).
2. **Backend ingest API** (`POST /api/events`) validates payloads, deduplicates using deterministic `event_hash`, and persists events in SQLite.
3. **Metrics API** (`GET /api/metrics`) computes worker/workstation/factory KPIs from persisted events.
4. **React dashboard** reads metadata + metrics and renders summary cards + detail tables with filters.

## Sample Setup
Pre-seeded metadata on startup:
- 6 workers (`W1..W6`)
- 6 workstations (`S1..S6`)

Pre-seeded dummy events for a full 8-hour sample shift at 15-minute intervals.

### Refresh dummy data API
- `POST /api/seed` clears and recreates deterministic sample events.
- Allows evaluators to refresh data without DB/manual edits.

## Database Schema
### `workers`
- `worker_id` (PK)
- `name`

### `workstations`
- `station_id` (PK)
- `name`
- `station_type`

### `ai_events`
- `id` (PK)
- `event_hash` (UNIQUE) — duplicate prevention
- `timestamp` (ISO time)
- `worker_id` (FK)
- `workstation_id` (FK)
- `event_type` (`working | idle | absent | product_count`)
- `confidence` (nullable)
- `count` (units for `product_count`)
- `created_at`

## API Endpoints
- `GET /health`
- `GET /api/metadata`
- `POST /api/events` (single event or array)
- `POST /api/seed`
- `GET /api/metrics?worker_id=W1&station_id=S3`

Example ingest payload:
```json
{
  "timestamp": "2026-01-15T10:15:00Z",
  "worker_id": "W1",
  "workstation_id": "S3",
  "event_type": "working",
  "confidence": 0.93,
  "count": 1
}
```

## Metric Definitions & Assumptions
### Time assumptions
- `working`, `idle`, `absent` are treated as state samples for a **15-minute interval** each.
- Time-based totals are `event_count * 15 minutes`.

### Worker metrics
- **Total active time:** `working blocks * 15min`
- **Total idle time:** `idle blocks * 15min`
- **Utilization %:** `working / (working + idle + absent)`
- **Total units produced:** sum of `product_count.count`
- **Units per hour:** `units / active_hours`

### Workstation metrics
- **Occupancy time:** `(working + idle) blocks * 15min`
- **Utilization %:** `working / (working + idle + absent)`
- **Total units produced:** sum of `product_count.count`
- **Throughput rate:** `units / active_hours`

### Factory metrics
- **Total productive time:** sum of worker active hours
- **Total production count:** sum of worker units
- **Average production rate:** total units / total active hours
- **Average utilization:** mean worker utilization %

### Aggregation behavior
- `product_count` events are additive unit events and independent of status events.
- Out-of-order events are fine because computation reads persisted historical timestamps.

## Reliability and Data Quality Handling
### Intermittent connectivity
- Backend persists all accepted events durably in SQLite.
- Edge systems can retry same payload safely; dedupe guarantees idempotent ingestion.
- Recommended production extension: add a message queue (Kafka/RabbitMQ/SQS) with retry DLQ.

### Duplicate events
- Unique `event_hash` based on timestamp + worker + station + type + count.
- Duplicate writes become no-op (`INSERT OR IGNORE`).

### Out-of-order timestamps
- Events are stored as-is with timestamps.
- Metrics are computed from all persisted events, independent of insertion order.

## Theoretical Questions
### 1) How to add model versioning?
- Include `model_id`, `model_version`, `camera_id` in each edge event.
- Track per-version KPI slices in analytics queries.
- Maintain model registry (artifact URI, training data snapshot, hyperparameters).

### 2) How to detect model drift?
- Monitor confidence distribution, label disagreement (human audits), and false positive/negative proxy rates by line/camera/shift.
- Alert on statistically significant shifts (PSI/KL, rolling z-scores).

### 3) How to trigger retraining?
- Define thresholds (e.g., utilization anomaly + confidence collapse + audit error rate increase).
- Trigger retraining pipeline via orchestrator (Airflow/GitHub Actions/Argo) with approval gates.
- Roll out canary model version and compare online KPIs.

### 4) How this scales (5 cameras → 100+ → multi-site)?
- **5 cameras:** single-node API + SQLite/Postgres.
- **100+ cameras:** stateless ingest replicas behind load balancer, queue-based buffering, Postgres partitioning/Timescale.
- **Multi-site:** regional ingest, event streaming backbone, central warehouse/lakehouse, tenant/site partitioning, per-site dashboard cache.

## Local Run (without Docker)
```bash
npm install
npm run install:all
npm run dev
```
- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Run with Docker
```bash
docker compose up --build
```
- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Tradeoffs
- SQLite chosen for simplicity and easy evaluator setup.
- Fixed 15-minute interval assumption for state-based durations.
- Metrics are computed at query time; for very high volume, pre-aggregation/materialized views would be added.
