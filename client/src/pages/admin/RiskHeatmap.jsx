// ============================================================================
// GigShield AI — Admin Risk Heatmap (Leaflet)
// ============================================================================

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { adminAPI } from '../../api';
import 'leaflet/dist/leaflet.css';

export default function RiskHeatmap() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await adminAPI.zones();
        setZones(data.data?.zones || []);
      } catch (err) { /* graceful */ }
      setLoading(false);
    }
    load();
  }, []);

  const riskColor = (score) => {
    const s = parseFloat(score) || 0;
    if (s >= 0.8) return '#ef4444';
    if (s >= 0.6) return '#f59e0b';
    if (s >= 0.4) return '#eab308';
    if (s >= 0.2) return '#22c55e';
    return '#06b6d4';
  };

  const riskRadius = (score) => {
    return 8 + (parseFloat(score) || 0) * 20;
  };

  return (
    <div className="gs-page gs-fade-in">
      <h1 className="gs-page-title">🗺️ Risk Heatmap</h1>
      <p className="gs-page-subtitle">Live disruption risk across delivery zones</p>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
        {[
          { color: '#06b6d4', label: 'Low (0-20%)' },
          { color: '#22c55e', label: 'Moderate (20-40%)' },
          { color: '#eab308', label: 'Elevated (40-60%)' },
          { color: '#f59e0b', label: 'High (60-80%)' },
          { color: '#ef4444', label: 'Critical (80-100%)' },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: l.color }} />
            <span style={{ color: 'var(--gs-text-secondary)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="gs-card" style={{ padding: 0, overflow: 'hidden', height: 520 }}>
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />

          {zones.map(zone => (
            <CircleMarker
              key={zone.id}
              center={[parseFloat(zone.latitude) || 20, parseFloat(zone.longitude) || 78]}
              radius={riskRadius(zone.risk_score)}
              pathOptions={{
                color: riskColor(zone.risk_score),
                fillColor: riskColor(zone.risk_score),
                fillOpacity: 0.35,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} permanent={false}>
                <strong>{zone.zone_name}</strong><br />
                {zone.city} · Risk: {(parseFloat(zone.risk_score) * 100).toFixed(0)}%
              </Tooltip>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>{zone.zone_name}</h4>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#666' }}>{zone.city}, {zone.state}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>Risk Score:</span>
                    <strong style={{ color: riskColor(zone.risk_score) }}>{(parseFloat(zone.risk_score) * 100).toFixed(0)}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span>Flood Risk:</span>
                    <span>{(parseFloat(zone.flood_risk || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                    <span>Coordinates:</span>
                    <span>{parseFloat(zone.latitude).toFixed(3)}, {parseFloat(zone.longitude).toFixed(3)}</span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Zone table */}
      <div className="gs-card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>All Zones</h3>
        <table className="gs-table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>City</th>
              <th>State</th>
              <th>Risk Score</th>
              <th>Flood Risk</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {zones.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).map(z => (
              <tr key={z.id}>
                <td style={{ fontWeight: 500 }}>{z.zone_name}</td>
                <td>{z.city}</td>
                <td>{z.state}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--gs-border)' }}>
                      <div style={{ width: `${(z.risk_score || 0) * 100}%`, height: '100%', borderRadius: 3, background: riskColor(z.risk_score) }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: riskColor(z.risk_score) }}>{((z.risk_score || 0) * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td style={{ fontSize: '0.85rem' }}>{((z.flood_risk || 0) * 100).toFixed(0)}%</td>
                <td><span className={`gs-badge gs-badge-${z.is_active ? 'success' : 'danger'}`}>{z.is_active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
