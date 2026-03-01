import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function MetricCard({ label, value }) {
    return (
        <div className="card metric">
        <p>{label}</p>
        <h3>{value}</h3>
        </div>
    );
}

function App() {
    const [metadata, setMetadata] = useState({ workers: [], workstations: [] });
    const [metrics, setMetrics] = useState(null);
    const [workerFilter, setWorkerFilter] = useState('');
    const [stationFilter, setStationFilter] = useState('');

    const query = useMemo(() => {
        const params = new URLSearchParams();
        if (workerFilter) params.set('worker_id', workerFilter);
        if (stationFilter) params.set('station_id', stationFilter);
        return params.toString();
    }, [workerFilter, stationFilter]);

    const load = async () => {
        const [metaRes, metricsRes] = await Promise.all([
        fetch(`${API_BASE}/api/metadata`),
        fetch(`${API_BASE}/api/metrics${query ? `?${query}` : ''}`)
        ]);

        setMetadata(await metaRes.json());
        setMetrics(await metricsRes.json());
    };

    useEffect(() => {
        load();
    }, [query]);

    const reseed = async () => {
        await fetch(`${API_BASE}/api/seed`, { method: 'POST' });
        await load();
    };

    if (!metrics) return <div className="container">Loading dashboard...</div>;

    return (
        <div className="container">
        <header>
            <h1>AI Worker Productivity Dashboard</h1>
            <button onClick={reseed}>Refresh Dummy Data</button>
        </header>

        <section className="filters card">
            <label>
            Worker:
            <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)}>
                <option value="">All</option>
                {metadata.workers.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>{w.name}</option>
                ))}
            </select>
            </label>
            <label>
            Workstation:
            <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
                <option value="">All</option>
                {metadata.workstations.map((s) => (
                <option key={s.station_id} value={s.station_id}>{s.name}</option>
                ))}
            </select>
            </label>
        </section>

        <section className="grid four">
            <MetricCard label="Total Productive Hours" value={metrics.factory.total_productive_hours} />
            <MetricCard label="Total Production Count" value={metrics.factory.total_production_count} />
            <MetricCard label="Average Production Rate" value={metrics.factory.avg_production_rate + ' units/hr'} />
            <MetricCard label="Avg Worker Utilization" value={metrics.factory.avg_worker_utilization_pct + '%'} />
        </section>

        <section>
            <h2>Workers</h2>
            <div className="table-wrap card">
            <table>
                <thead>
                <tr>
                    <th>ID</th><th>Name</th><th>Active (h)</th><th>Idle (h)</th><th>Utilization %</th><th>Units</th><th>Units/h</th>
                </tr>
                </thead>
                <tbody>
                {metrics.workers.map((w) => (
                    <tr key={w.worker_id}>
                    <td>{w.worker_id}</td><td>{w.name}</td><td>{w.active_hours}</td><td>{w.idle_hours}</td><td>{w.utilization_pct}</td><td>{w.units_produced}</td><td>{w.units_per_hour}</td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </section>

        <section>
            <h2>Workstations</h2>
            <div className="table-wrap card">
            <table>
                <thead>
                <tr>
                    <th>ID</th><th>Name</th><th>Type</th><th>Occupancy (h)</th><th>Utilization %</th><th>Units</th><th>Throughput</th>
                </tr>
                </thead>
                <tbody>
                {metrics.workstations.map((s) => (
                    <tr key={s.station_id}>
                    <td>{s.station_id}</td><td>{s.name}</td><td>{s.station_type}</td><td>{s.occupancy_hours}</td><td>{s.utilization_pct}</td><td>{s.units_produced}</td><td>{s.throughput_rate}</td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </section>

        <p className="assumption">Assumption: {metrics.assumptions.explanation}</p>
        </div>
    );
}

createRoot(document.getElementById('root')).render(<App />);