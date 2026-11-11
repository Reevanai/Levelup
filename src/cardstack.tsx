import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { CARD_DESIGNS } from '../shared/constants';

export const designOf = (key: string) => CARD_DESIGNS.find((d) => d.key === key) ?? CARD_DESIGNS[0];

const ChipGlyph = () => (
  <svg className="chipline" width="22" height="26" viewBox="0 0 22 26" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <rect x="1" y="1" width="20" height="24" rx="4" /><rect x="7" y="8" width="8" height="10" rx="2" /><path d="M1 9h6M1 17h6M15 9h6M15 17h6M11 1v7M11 18v7" />
  </svg>
);

export interface Face { bg: string; ink: string; name: string; sub?: string; mark?: ReactNode; to?: string; onClick?: () => void; label: string; off?: boolean }

function Card({ face, pos }: { face: Face; pos: 'front' | 'left' | 'right' }) {
  const style: CSSProperties = { background: face.bg, color: face.ink };
  const cls = `pcard ${pos} ${face.off ? 'off' : ''}`;
  const inner = (<>
    <div className="mark">{face.mark ?? <Zap size={24} fill="currentColor" strokeWidth={0} />}</div>
    <ChipGlyph />
    <div className="name">{face.name}</div>
    {face.sub && <div className="num4">{face.sub}</div>}
  </>);
  if (face.to) return <Link to={face.to} className={cls} style={style} aria-label={face.label}>{inner}</Link>;
  if (face.onClick) return <button type="button" className={cls} style={style} aria-label={face.label} onClick={face.onClick}>{inner}</button>;
  return <div className={cls} style={style} role="img" aria-label={face.label}>{inner}</div>;
}

/** Three cards fanned out, cropped at the bottom, with a small tab of shortcuts. */
export function CardFan({ front, left, right, tab, note }: { front: Face; left?: Face; right?: Face; tab?: ReactNode; note?: ReactNode }) {
  return (
    <div className="fan">
      {left && <Card face={left} pos="left" />}
      {right && <Card face={right} pos="right" />}
      <Card face={front} pos="front" />
      {note && <div className="fan-note" role="status">{note}</div>}
      {tab && <div className="fan-tab">{tab}</div>}
    </div>
  );
}

/** A soft two-stop gradient from one colour, for vault cards. */
export const tint = (hex: string) => `linear-gradient(160deg, color-mix(in srgb, ${hex} 70%, #fff) 0%, ${hex} 55%, color-mix(in srgb, ${hex} 70%, #000) 100%)`;
