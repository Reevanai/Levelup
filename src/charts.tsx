import { useState } from 'react';
import { inr, inrShort } from './lib';

// Series colours (validated as an adjacent pair on the dark surface).
export const SERIES = { spent: '#9085e9', received: '#199e70' };

interface Slice { key: string; label: string; color: string; total: number }

/** Category share. Segments keep their fixed category colour and order. */
export function Donut({ data, size = 150, centerLabel = 'Spent' }: { data: Slice[]; size?: number; centerLabel?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const slices = data.filter((d) => d.total > 0);
  const total = slices.reduce((a, d) => a + d.total, 0);
  const r = size / 2 - 11, cx = size / 2, stroke = 20, gap = slices.length > 1 ? 0.035 : 0;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = (s.total / total) * Math.PI * 2;
    const a0 = angle + gap / 2, a1 = angle + Math.max(sweep - gap / 2, gap / 2 + 0.001);
    angle += sweep;
    const p = (a: number) => `${cx + r * Math.cos(a)} ${cx + r * Math.sin(a)}`;
    return { ...s, d: sweep >= Math.PI * 2 - 0.001 ? `M ${cx} ${cx - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cx - r}` : `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}` };
  });
  const active = slices.find((s) => s.key === hover);
  return (
    <div className="chart" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Spending by category, total ${inr(total)}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={hover === a.key ? stroke + 5 : stroke} opacity={hover && hover !== a.key ? 0.35 : 1}
            style={{ transition: 'all .2s', cursor: 'pointer' }} tabIndex={0} aria-label={`${a.label}: ${inr(a.total)}`}
            onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(a.key)} onBlur={() => setHover(null)} />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        <div>
          <div className="tiny muted" style={{ maxWidth: 88 }}>{active ? active.label : centerLabel}</div>
          <div className="num" style={{ fontSize: 19, fontWeight: 700 }}>{inrShort(active ? active.total : total)}</div>
          {active && <div className="tiny muted">{Math.round((active.total / total) * 100)}%</div>}
        </div>
      </div>
    </div>
  );
}

export function CategoryLegend({ data, limit = 6 }: { data: Slice[]; limit?: number }) {
  const total = data.reduce((a, d) => a + d.total, 0);
  const rows = data.filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, limit);
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {rows.map((d) => (
        <li key={d.key} className="row small" style={{ gap: 8 }}>
          <i className="swatch-dot" style={{ background: d.color, marginRight: 0 }} />
          <span className="grow truncate t2">{d.label}</span>
          <span className="num" style={{ fontWeight: 650 }}>{inr(d.total)}</span>
          <span className="muted tiny" style={{ width: 30, textAlign: 'right' }}>{Math.round((d.total / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

interface BarDatum { label: string; values: number[] }

/** Bars on one shared axis. One series needs no legend; two get one. */
export function Bars({ data, series, height = 150, title }: { data: BarDatum[]; series: { name: string; color: string }[]; height?: number; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 340, padB = 22, padT = 8, H = height;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const band = W / data.length, n = series.length;
  const bw = Math.min(26, (band - 10 - (n - 1) * 2) / n);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const h = hover === null ? null : data[hover];
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {n > 1 && <div className="legend" style={{ marginBottom: 8 }}>{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
      <div className="chart" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="rgba(255,255,255,.07)" strokeDasharray="3 4" />)}
          <text x={W} y={y(nice) - 3} textAnchor="end">{inrShort(nice)}</text>
          <line x1="0" x2={W} y1={H - padB} y2={H - padB} stroke="rgba(255,255,255,.14)" />
          {data.map((d, i) => {
            const x0 = i * band + (band - (bw * n + (n - 1) * 2)) / 2;
            return (
              <g key={i} opacity={hover !== null && hover !== i ? 0.4 : 1} style={{ transition: 'opacity .15s' }}>
                {d.values.map((v, s) => {
                  const top = y(v), bh = Math.max(v > 0 ? 3 : 0, H - padB - top), rr = Math.min(4, bh);
                  const x = x0 + s * (bw + 2);
                  return <path key={s} fill={series[s].color} d={`M ${x} ${H - padB} V ${H - padB - bh + rr} Q ${x} ${H - padB - bh} ${x + rr} ${H - padB - bh} H ${x + bw - rr} Q ${x + bw} ${H - padB - bh} ${x + bw} ${H - padB - bh + rr} V ${H - padB} Z`} />;
                })}
                <text x={i * band + band / 2} y={H - 6} textAnchor="middle" style={hover === i ? { fill: '#fff' } : undefined}>{d.label}</text>
                {/* Hit target is the whole band, not just the bar. */}
                <rect x={i * band} y={0} width={band} height={H} fill="transparent" tabIndex={0} aria-label={`${d.label}: ${d.values.map((v, s) => `${series[s].name} ${inr(v)}`).join(', ')}`}
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onTouchStart={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div className="tip" style={{ left: `${Math.min(86, Math.max(14, ((hover + 0.5) / data.length) * 100))}%`, top: `${(y(Math.max(...h.values)) / H) * 100}%` }}>
            <div className="muted tiny">{h.label}</div>
            {h.values.map((v, s) => <div key={s}>{n > 1 && <i className="swatch-dot" style={{ background: series[s].color }} />}{n > 1 && <span className="t2">{series[s].name} </span>}<b>{inr(v)}</b></div>)}
          </div>
        )}
      </div>
      <div className="sr"><table>
        <caption>{title}</caption>
        <thead><tr><th>Period</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td>{d.values.map((v, i) => <td key={i}>{inr(v)}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
  );
}

/** Half-circle score gauge. Colour encodes state, and the label always says it in words too. */
export function Gauge({ score, label, size = 180 }: { score: number; label: string; size?: number }) {
  const r = size / 2 - 14, c = Math.PI * r;
  const color = score >= 80 ? '#39ff9c' : score >= 60 ? '#a78bfa' : score >= 40 ? '#ffc24b' : '#ff6b81';
  return (
    <div style={{ width: size, height: size / 2 + 22, position: 'relative', margin: '0 auto' }} role="img" aria-label={`Financial health ${score} out of 100, ${label}`}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={`M 14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M 14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center' }}>
        <div className="num" style={{ fontSize: 40, fontWeight: 750, lineHeight: 1 }}>{score}</div>
        <div className="small" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{label}</div>
      </div>
    </div>
  );
}
