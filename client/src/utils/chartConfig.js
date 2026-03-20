// ============================================================================
// GigShield AI — Chart.js Global Configuration
// ============================================================================

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend,
} from 'chart.js';

// Register all components
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

// Global dark theme defaults
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.06)';
ChartJS.defaults.font.family = 'Inter, sans-serif';

// ── Reusable chart color palettes ──
export const COLORS = {
  accent:  '#6366f1',
  accentLight: '#818cf8',
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
  info:    '#06b6d4',
  purple:  '#8b5cf6',
  pink:    '#ec4899',
};

export const GRADIENTS = {
  accent: (ctx) => {
    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
    g.addColorStop(0, 'rgba(99,102,241,0.4)');
    g.addColorStop(1, 'rgba(99,102,241,0.02)');
    return g;
  },
  success: (ctx) => {
    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
    g.addColorStop(0, 'rgba(16,185,129,0.4)');
    g.addColorStop(1, 'rgba(16,185,129,0.02)');
    return g;
  },
  danger: (ctx) => {
    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
    g.addColorStop(0, 'rgba(239,68,68,0.4)');
    g.addColorStop(1, 'rgba(239,68,68,0.02)');
    return g;
  },
};

// ── Shared chart options ──
export const LINE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111827',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      padding: 12,
      titleFont: { weight: 600 },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
  elements: {
    line: { tension: 0.4, borderWidth: 2 },
    point: { radius: 0, hoverRadius: 5 },
  },
};

export const BAR_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111827',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      padding: 12,
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

export const DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '72%',
  plugins: {
    legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } },
    tooltip: { backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12 },
  },
};
