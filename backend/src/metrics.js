import { db } from './db.js';

const INTERVAL_MINUTES = 15;
const INTERVAL_HOURS = INTERVAL_MINUTES / 60;

function convertBlocksToHours(blocks) {
  return Number((blocks * INTERVAL_HOURS).toFixed(2));
}

function calculateUtilization(active, idle, absent) {
  const total = active + idle + absent;
  if (total === 0) return 0;
  return Number(((active / total) * 100).toFixed(2));
}

export function computeMetrics({ workerId, stationId }) {

  let whereClause = "";
  const params = {};

  if (workerId) {
    whereClause += " AND worker_id = @workerId";
    params.workerId = workerId;
  }

  if (stationId) {
    whereClause += " AND workstation_id = @stationId";
    params.stationId = stationId;
  }

  const statusData = db.prepare(`
    SELECT worker_id, workstation_id, event_type, COUNT(*) as total
    FROM ai_events
    WHERE event_type IN ('working', 'idle', 'absent') ${whereClause}
    GROUP BY worker_id, workstation_id, event_type
  `).all(params);

  const productData = db.prepare(`
    SELECT worker_id, workstation_id, SUM(count) as total_units
    FROM ai_events
    WHERE event_type = 'product_count' ${whereClause}
    GROUP BY worker_id, workstation_id
  `).all(params);

  const workers = db.prepare(`
    SELECT worker_id, name FROM workers
  `).all();

  const stations = db.prepare(`
    SELECT station_id, name, station_type FROM workstations
  `).all();

  const workerMetrics = [];
  for (let worker of workers) {

    let activeBlocks = 0;
    let idleBlocks = 0;
    let absentBlocks = 0;
    let units = 0;

    for (let row of statusData) {
      if (row.worker_id === worker.worker_id) {
        if (row.event_type === "working") {
          activeBlocks += row.total;
        } else if (row.event_type === "idle") {
          idleBlocks += row.total;
        } else if (row.event_type === "absent") {
          absentBlocks += row.total;
        }
      }
    }

    for (let row of productData) {
      if (row.worker_id === worker.worker_id) {
        units += row.total_units || 0;
      }
    }

    const activeHours = convertBlocksToHours(activeBlocks);
    const idleHours = convertBlocksToHours(idleBlocks);

    workerMetrics.push({
      worker_id: worker.worker_id,
      name: worker.name,
      active_hours: activeHours,
      idle_hours: idleHours,
      utilization_pct: calculateUtilization(activeBlocks, idleBlocks, absentBlocks),
      units_produced: units,
      units_per_hour: Number((units / Math.max(activeHours, 0.01)).toFixed(2))
    });
  }

  const stationMetrics = [];
  for (let station of stations) {

    let activeBlocks = 0;
    let idleBlocks = 0;
    let absentBlocks = 0;
    let units = 0;

    for (let row of statusData) {
      if (row.workstation_id === station.station_id) {
        if (row.event_type === "working") {
          activeBlocks += row.total;
        } else if (row.event_type === "idle") {
          idleBlocks += row.total;
        } else if (row.event_type === "absent") {
          absentBlocks += row.total;
        }
      }
    }

    for (let row of productData) {
      if (row.workstation_id === station.station_id) {
        units += row.total_units || 0;
      }
    }

    const occupancyHours = convertBlocksToHours(activeBlocks + idleBlocks);
    const activeHours = convertBlocksToHours(activeBlocks);

    stationMetrics.push({
      station_id: station.station_id,
      name: station.name,
      station_type: station.station_type,
      occupancy_hours: occupancyHours,
      utilization_pct: calculateUtilization(activeBlocks, idleBlocks, absentBlocks),
      units_produced: units,
      throughput_rate: Number((units / Math.max(activeHours, 0.01)).toFixed(2))
    });
  }

  let totalActiveHours = 0;
  let totalUnits = 0;
  let totalUtilization = 0;

  for (let w of workerMetrics) {
    totalActiveHours += w.active_hours;
    totalUnits += w.units_produced;
    totalUtilization += w.utilization_pct;
  }

  return {
    factory: {
      total_productive_hours: Number(totalActiveHours.toFixed(2)),
      total_production_count: totalUnits,
      avg_production_rate: Number((totalUnits / Math.max(totalActiveHours, 0.01)).toFixed(2)),
      avg_worker_utilization_pct: Number((totalUtilization / Math.max(workerMetrics.length, 1)).toFixed(2))
    },
    workers: workerMetrics,
    workstations: stationMetrics,
    assumptions: {
      sampling_interval_minutes: INTERVAL_MINUTES,
      explanation:
        "Each working/idle/absent event represents a 15-minute block. Product_count events add production units. Metrics are calculated directly from stored events."
    }
  };
}