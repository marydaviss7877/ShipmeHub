import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── City data — approximate % positions on the map container ──
const CITIES = [
  { name: 'New York',      x: 83, y: 27, region: 'Northeast'  },
  { name: 'Los Angeles',   x: 11, y: 53, region: 'West Coast' },
  { name: 'Chicago',       x: 63, y: 26, region: 'Midwest'    },
  { name: 'Houston',       x: 47, y: 64, region: 'South'      },
  { name: 'Phoenix',       x: 22, y: 55, region: 'Southwest'  },
  { name: 'Philadelphia',  x: 81, y: 30, region: 'Northeast'  },
  { name: 'Dallas',        x: 50, y: 60, region: 'South'      },
  { name: 'San Jose',      x: 8,  y: 43, region: 'West Coast' },
  { name: 'Austin',        x: 47, y: 66, region: 'South'      },
  { name: 'Jacksonville',  x: 74, y: 58, region: 'Southeast'  },
  { name: 'Columbus',      x: 70, y: 32, region: 'Midwest'    },
  { name: 'Charlotte',     x: 74, y: 44, region: 'Southeast'  },
  { name: 'Indianapolis',  x: 67, y: 33, region: 'Midwest'    },
  { name: 'San Francisco', x: 7,  y: 41, region: 'West Coast' },
  { name: 'Seattle',       x: 10, y: 15, region: 'Pacific NW' },
  { name: 'Denver',        x: 33, y: 38, region: 'Mountain'   },
  { name: 'Nashville',     x: 67, y: 46, region: 'Southeast'  },
  { name: 'Miami',         x: 77, y: 70, region: 'Southeast'  },
  { name: 'Atlanta',       x: 71, y: 52, region: 'Southeast'  },
  { name: 'Minneapolis',   x: 54, y: 19, region: 'Midwest'    },
  { name: 'Boston',        x: 87, y: 23, region: 'Northeast'  },
  { name: 'Portland',      x: 9,  y: 17, region: 'Pacific NW' },
  { name: 'Detroit',       x: 70, y: 25, region: 'Midwest'    },
  { name: 'Las Vegas',     x: 19, y: 49, region: 'Southwest'  },
  { name: 'Memphis',       x: 63, y: 50, region: 'South'      },
  { name: 'Baltimore',     x: 81, y: 32, region: 'Northeast'  },
  { name: 'Kansas City',   x: 55, y: 40, region: 'Midwest'    },
  { name: 'New Orleans',   x: 62, y: 67, region: 'South'      },
  { name: 'Albuquerque',   x: 30, y: 53, region: 'Southwest'  },
  { name: 'Salt Lake City',x: 24, y: 36, region: 'Mountain'   },
];

const CARRIER_CFG: Record<string, { color: string; glow: string; pct: number }> = {
  USPS:  { color: '#3b82f6', glow: 'rgba(59,130,246,0.5)',   pct: 52 },
  UPS:   { color: '#f59e0b', glow: 'rgba(245,158,11,0.5)',   pct: 22 },
  FedEx: { color: '#a855f7', glow: 'rgba(168,85,247,0.5)',   pct: 17 },
  DHL:   { color: '#ef4444', glow: 'rgba(239,68,68,0.5)',    pct: 9  },
};
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const REGIONS = ['Northeast','West Coast','Midwest','South','Southeast','Southwest','Mountain','Pacific NW'];

// ── Seeded random (deterministic on first render, changes per session) ──
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)] as T;
const fmt  = (n: number) => n.toLocaleString();

function buildBase() {
  const today     = rand(1200, 2200);
  const thisHour  = rand(60,   180);
  const yesterday = rand(1600, 3200);
  const week      = rand(11000, 19000);
  // per-carrier totals for today
  const perCarrier: Record<string, number> = {};
  CARRIERS.forEach(c => { perCarrier[c] = Math.round(today * CARRIER_CFG[c].pct / 100); });
  // 7-day bar chart values
  const days7: number[] = [];
  for (let i = 6; i >= 0; i--) {
    days7.push(i === 0 ? today : rand(900, 3000));
  }
  return { today, thisHour, yesterday, week, perCarrier, days7 };
}

interface FeedItem {
  id: number;
  carrier: string;
  count: number;
  region: string;
  city: string;
  age: number; // seconds since created
}

// ── Animated counter ──────────────────────────────────────────
function useCounter(target: number) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const diff = target - from;
    if (!diff) return;
    const start = performance.now();
    const dur   = 900;
    let raf: number;
    const step = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + diff * e));
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

// ── Stat card ─────────────────────────────────────────────────
const StatCard = ({
  label, value, sub, flash, accent,
}: { label: string; value: number; sub?: string; flash: boolean; accent: string }) => {
  const displayed = useCounter(value);
  return (
    <div style={{
      background: '#fff',
      border: `1.5px solid ${flash ? accent : 'var(--navy-100)'}`,
      borderRadius: 14, padding: '1.1rem 1.25rem',
      transition: 'border-color 0.4s',
      boxShadow: flash ? `0 0 0 3px ${accent}22` : '0 1px 3px rgba(0,0,0,0.06)',
      position: 'relative', overflow: 'hidden',
    }}>
      {flash && (
        <div style={{
          position: 'absolute', inset: 0, background: `${accent}0d`,
          animation: 'la-flash 0.8s ease-out forwards',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {fmt(displayed)}
      </div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────
let feedIdCounter = 100;

const LiveActivity: React.FC = () => {
  const [base,       setBase]       = useState(buildBase);
  const [flash,      setFlash]      = useState<Record<string, boolean>>({});
  const [feed,       setFeed]       = useState<FeedItem[]>([]);
  const [activeDots, setActiveDots] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (let i = 0; i < 18; i++) s.add(rand(0, CITIES.length - 1));
    return s;
  });
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [secAgo,     setSecAgo]     = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // Tick: update feed item ages every second
  useEffect(() => {
    const iv = setInterval(() => {
      setSecAgo(Math.floor((Date.now() - lastUpdate) / 1000));
      setFeed(prev => prev.map(f => ({ ...f, age: f.age + 1 })));
    }, 1000);
    return () => clearInterval(iv);
  }, [lastUpdate]);

  // Main update: every 30–55 seconds
  const doUpdate = useCallback(() => {
    const carrier  = pick(CARRIERS);
    const cityIdx  = rand(0, CITIES.length - 1);
    const city     = CITIES[cityIdx];
    const newCount = rand(8, 45);

    // Increment stats
    setBase(prev => {
      const perCarrier = { ...prev.perCarrier };
      perCarrier[carrier] = (perCarrier[carrier] || 0) + newCount;
      return {
        ...prev,
        today:    prev.today    + newCount,
        thisHour: prev.thisHour + newCount,
        week:     prev.week     + newCount,
        perCarrier,
      };
    });

    // Flash the stat cards
    setFlash({ today: true, thisHour: true, week: true });
    setTimeout(() => setFlash({}), 1000);

    // Add to feed
    const item: FeedItem = {
      id: ++feedIdCounter,
      carrier,
      count: newCount,
      region: city.region,
      city: city.name,
      age: 0,
    };
    setFeed(prev => [item, ...prev].slice(0, 12));

    // Pulse a new dot on the map
    setActiveDots(prev => {
      const next = new Set(prev);
      next.add(cityIdx);
      if (next.size > 22) {
        const first = next.values().next().value;
        next.delete(first);
      }
      return next;
    });

    setLastUpdate(Date.now());
    setSecAgo(0);
  }, []);

  // Schedule next update every 30–55s
  useEffect(() => {
    // First update after 4 seconds (immediate feel on load)
    const first = setTimeout(doUpdate, 4000);
    let recurse: ReturnType<typeof setTimeout>;
    const schedule = () => {
      recurse = setTimeout(() => { doUpdate(); schedule(); }, rand(30000, 55000));
    };
    const afterFirst = setTimeout(schedule, 4500);
    return () => { clearTimeout(first); clearTimeout(afterFirst); clearTimeout(recurse); };
  }, [doUpdate]);

  // Seed initial feed
  useEffect(() => {
    const initial: FeedItem[] = [];
    for (let i = 0; i < 8; i++) {
      const carrier = pick(CARRIERS);
      const city    = pick(CITIES);
      initial.push({
        id: ++feedIdCounter,
        carrier,
        count: rand(8, 45),
        region: city.region,
        city: city.name,
        age: rand(60, 600),
      });
    }
    setFeed(initial);
  }, []);

  const ageLabel = (s: number) => {
    if (s < 5)   return 'just now';
    if (s < 60)  return `${s}s ago`;
    if (s < 120) return '1 min ago';
    return `${Math.floor(s / 60)}m ago`;
  };

  const totalToday = Object.values(base.perCarrier).reduce((a, b) => a + b, 0);

  // Day labels for 7-day chart
  const dayLabels = ['6d', '5d', '4d', '3d', '2d', 'Yest', 'Today'];
  const maxDay = Math.max(...base.days7);

  return (
    <>
      <style>{`
        @keyframes la-flash    { 0%{opacity:1} 100%{opacity:0} }
        @keyframes la-pulse    { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(2.4);opacity:0} }
        @keyframes la-blink    { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes la-slidein  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes la-bar      { from{width:0%} to{width:var(--tw)} }
        @keyframes la-ripple   { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(3.5);opacity:0} }
      `}</style>

      <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Live Shipping Activity</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>Platform-wide label generation across all carriers</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '6px 14px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'la-blink 1.4s ease-in-out infinite' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>LIVE</span>
            <span style={{ fontSize: '0.72rem', color: '#4ade80', marginLeft: 2 }}>
              {secAgo < 5 ? 'just updated' : `updated ${secAgo}s ago`}
            </span>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          <StatCard label="This Hour"    value={base.thisHour}  flash={!!flash.thisHour} accent="#6366f1" sub="labels generated" />
          <StatCard label="Today"        value={base.today}     flash={!!flash.today}    accent="#22c55e" sub={`${fmt(Math.round(base.today / 24))} avg/hr`} />
          <StatCard label="Yesterday"    value={base.yesterday} flash={false}            accent="#f59e0b" sub="completed labels" />
          <StatCard label="Last 7 Days"  value={base.week}      flash={!!flash.week}     accent="#3b82f6" sub={`${fmt(Math.round(base.week / 7))} avg/day`} />
        </div>

        {/* ── Middle row: Map + Breakdown ─────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '0.875rem', alignItems: 'start' }}>

          {/* US Activity Map */}
          <div style={{
            background: '#0b1120',
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid #1e293b',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}>
            {/* Map header */}
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                United States · Activity Map
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                {CARRIERS.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: CARRIER_CFG[c].color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map body */}
            <div style={{ position: 'relative', height: 310, overflow: 'hidden' }}>

              {/* ── SVG US outline ─────────────────────────────── */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                aria-hidden="true"
              >
                {/* Ocean */}
                <rect width="100" height="100" fill="#06101e" />
                {/* US landmass fill */}
                <path
                  d="M7,10 L57,6 L58,9 L63,9 L67,12 L72,10 L79,13 L85,16 L88,21 L85,26 L82,31 L80,37 L77,44 L75,53 L75,58 L77,63 L79,73 L77,79 L73,73 L68,69 L60,68 L55,71 L50,68 L42,66 L28,66 L21,63 L17,58 L12,57 L7,56 L5,53 L5,47 L6,38 L5,28 L6,18 L7,13 Z"
                  fill="#0d1f35"
                />
                {/* US border / coastline */}
                <path
                  d="M7,10 L57,6 L58,9 L63,9 L67,12 L72,10 L79,13 L85,16 L88,21 L85,26 L82,31 L80,37 L77,44 L75,53 L75,58 L77,63 L79,73 L77,79 L73,73 L68,69 L60,68 L55,71 L50,68 L42,66 L28,66 L21,63 L17,58 L12,57 L7,56 L5,53 L5,47 L6,38 L5,28 L6,18 L7,13 Z"
                  fill="none"
                  stroke="#2a6090"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
                {/* Interior glow along the coast */}
                <path
                  d="M7,10 L57,6 L58,9 L63,9 L67,12 L72,10 L79,13 L85,16 L88,21 L85,26 L82,31 L80,37 L77,44 L75,53 L75,58 L77,63 L79,73 L77,79 L73,73 L68,69 L60,68 L55,71 L50,68 L42,66 L28,66 L21,63 L17,58 L12,57 L7,56 L5,53 L5,47 L6,38 L5,28 L6,18 L7,13 Z"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  opacity="0.12"
                />
                {/* Subtle region lines (Mississippi, Rockies hint) */}
                <line x1="55" y1="6" x2="53" y2="72" stroke="#ffffff" strokeWidth="0.15" opacity="0.08" />
                <line x1="28" y1="6" x2="30" y2="66" stroke="#ffffff" strokeWidth="0.15" opacity="0.08" />
              </svg>

              {/* Vignette */}
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(6,16,30,0.75) 100%)', pointerEvents: 'none', zIndex: 2 }} />

              {/* City dots */}
              {CITIES.map((city, i) => {
                const isActive = activeDots.has(i);
                const carrier  = CARRIERS[i % CARRIERS.length];
                const color    = CARRIER_CFG[carrier].color;
                return (
                  <div key={city.name} title={`${city.name} · ${city.region}`} style={{
                    position: 'absolute',
                    left: `${city.x}%`,
                    top:  `${city.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                    cursor: 'default',
                  }}>
                    {/* Ripple ring (shown on active) */}
                    {isActive && (
                      <div style={{
                        position: 'absolute',
                        width: 18, height: 18,
                        borderRadius: '50%',
                        border: `1.5px solid ${color}`,
                        top: '50%', left: '50%',
                        transform: 'translate(-50%,-50%)',
                        animation: 'la-ripple 1.8s ease-out infinite',
                        pointerEvents: 'none',
                      }} />
                    )}
                    {/* Pulse ring */}
                    <div style={{
                      position: 'absolute',
                      width: 10, height: 10,
                      borderRadius: '50%',
                      background: color,
                      opacity: 0.25,
                      top: '50%', left: '50%',
                      transform: 'translate(-50%,-50%)',
                      animation: isActive ? `la-pulse 2s ease-out infinite` : undefined,
                      pointerEvents: 'none',
                    }} />
                    {/* Core dot */}
                    <div style={{
                      width: isActive ? 7 : 4,
                      height: isActive ? 7 : 4,
                      borderRadius: '50%',
                      background: isActive ? color : '#2a4a6e',
                      boxShadow: isActive ? `0 0 10px ${CARRIER_CFG[carrier].glow}` : 'none',
                      transition: 'all 0.4s ease',
                      position: 'relative', zIndex: 4,
                    }} />
                    {/* City name label — only for active dots */}
                    {isActive && (
                      <div style={{
                        position: 'absolute',
                        top: 10, left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.8)',
                        pointerEvents: 'none',
                        textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                        letterSpacing: '0.02em',
                      }}>
                        {city.name}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Floating counter badge */}
              <div style={{
                position: 'absolute', bottom: 14, right: 16, zIndex: 10,
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '8px 14px',
              }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f1f5f9', lineHeight: 1 }}>{fmt(base.today)}</div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>labels today</div>
              </div>

              {/* Region activity label (follows last feed item) */}
              {feed[0] && (
                <div style={{
                  position: 'absolute', top: 14, left: 16, zIndex: 10,
                  background: `${CARRIER_CFG[feed[0].carrier].color}22`,
                  border: `1px solid ${CARRIER_CFG[feed[0].carrier].color}44`,
                  borderRadius: 8, padding: '5px 10px',
                  animation: 'la-slidein 0.5s ease',
                }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: CARRIER_CFG[feed[0].carrier].color }}>
                    +{feed[0].count} {feed[0].carrier} · {feed[0].region}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Carrier breakdown + 7-day chart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Carrier breakdown */}
            <div className="sh-card" style={{ padding: '1rem 1.125rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.875rem' }}>
                Carrier Breakdown · Today
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {CARRIERS.map(c => {
                  const count = base.perCarrier[c] || 0;
                  const pct   = totalToday > 0 ? Math.round((count / totalToday) * 100) : CARRIER_CFG[c].pct;
                  return (
                    <div key={c}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CARRIER_CFG[c].color, display: 'inline-block' }} />
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)' }}>{c}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{fmt(count)}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: CARRIER_CFG[c].color, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: CARRIER_CFG[c].color,
                          borderRadius: 99,
                          transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 7-day mini bar chart */}
            <div className="sh-card" style={{ padding: '1rem 1.125rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.875rem' }}>
                Last 7 Days
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
                {base.days7.map((v, i) => {
                  const h = Math.round((v / maxDay) * 100);
                  const isToday = i === 6;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                      <div title={`${fmt(v)} labels`} style={{
                        width: '100%',
                        height: `${h}%`,
                        background: isToday ? '#3b82f6' : 'var(--navy-200)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)',
                        position: 'relative',
                      }}>
                        {isToday && (
                          <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 2 }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#3b82f6', whiteSpace: 'nowrap' }}>{fmt(v)}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.55rem', color: isToday ? '#3b82f6' : 'var(--navy-400)', fontWeight: isToday ? 700 : 400 }}>
                        {dayLabels[i]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active now indicator */}
            <div style={{
              borderRadius: 12, padding: '0.75rem 1rem',
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
                  Processing Now
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                  {rand(3, 18)} <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>active jobs</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {CARRIERS.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: CARRIER_CFG[c].color, animation: 'la-blink 1.8s ease-in-out infinite', animationDelay: `${CARRIERS.indexOf(c) * 0.3}s`, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Live feed ────────────────────────────────────────── */}
        <div className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '0.75rem 1.125rem',
            borderBottom: '1px solid var(--navy-100)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--navy-25)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'la-blink 1.2s ease-in-out infinite' }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Activity Feed
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginLeft: 2 }}>
              — live updates every ~45 seconds
            </span>
          </div>

          <div ref={feedRef} style={{ maxHeight: 280, overflowY: 'auto' }}>
            {feed.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.82rem' }}>
                Waiting for activity…
              </div>
            ) : feed.map((item, idx) => {
              const cfg = CARRIER_CFG[item.carrier];
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0.6rem 1.125rem',
                    borderBottom: idx < feed.length - 1 ? '1px solid var(--navy-50)' : 'none',
                    animation: item.age < 3 ? 'la-slidein 0.4s ease' : undefined,
                    background: item.age < 3 ? `${cfg.color}08` : 'transparent',
                    transition: 'background 1s',
                  }}
                >
                  {/* Carrier dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: cfg.color, flexShrink: 0,
                    boxShadow: item.age < 10 ? `0 0 6px ${cfg.glow}` : 'none',
                  }} />

                  {/* Carrier badge */}
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 800,
                    background: `${cfg.color}18`, color: cfg.color, flexShrink: 0, minWidth: 46, textAlign: 'center',
                  }}>
                    {item.carrier}
                  </span>

                  {/* Count */}
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)', flexShrink: 0 }}>
                    +{item.count} labels
                  </span>

                  {/* Location */}
                  <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)', flex: 1 }}>
                    {item.city} · {item.region}
                  </span>

                  {/* Time */}
                  <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', flexShrink: 0 }}>
                    {ageLabel(item.age)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
};

export default LiveActivity;
