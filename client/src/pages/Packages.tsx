import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckIcon,
  SparklesIcon,
  RocketLaunchIcon,
  BuildingOffice2Icon,
  StarIcon,
} from '@heroicons/react/24/outline';

// ── Package definitions ────────────────────────────────────────────────────────
interface PackageTier {
  id: string;
  name: string;
  tagline: string;
  monthlyMin: number;        // minimum monthly label spend ($)
  discount: number;          // % off retail USPS rates
  creditLimit: number;       // credit facility ($)
  Icon: React.ElementType;
  color: string;
  gradient: string;
  badge?: string;
  features: string[];
}

const PACKAGES: PackageTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Perfect for new sellers getting started',
    monthlyMin: 0,
    discount: 5,
    creditLimit: 0,
    Icon: StarIcon,
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #64748b, #94a3b8)',
    features: [
      'USPS, UPS, FedEx & DHL labels',
      'Up to 5% off retail rates',
      'Single & bulk label generation',
      'Standard manifest processing',
      'Label history & tracking',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For scaling sellers with volume needs',
    monthlyMin: 500,
    discount: 12,
    creditLimit: 200,
    Icon: RocketLaunchIcon,
    color: '#1D4ED8',
    gradient: 'linear-gradient(135deg, #1D4ED8, #6366f1)',
    badge: 'Most Popular',
    features: [
      'Everything in Starter',
      'Up to 12% off retail rates',
      '$200 credit facility (pay later)',
      'Priority manifest processing',
      'Real-time shipment activity',
      'Dedicated account manager',
      'Priority support (< 4h response)',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'High-volume operations & resellers',
    monthlyMin: 2000,
    discount: 20,
    creditLimit: 1000,
    Icon: SparklesIcon,
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed, #c026d3)',
    features: [
      'Everything in Growth',
      'Up to 20% off retail rates',
      '$1,000 credit facility',
      'Reseller sub-account support',
      'Batch API access',
      'Custom rate negotiation',
      'SLA-backed support (< 1h)',
      'Monthly performance reviews',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom contracts for large operations',
    monthlyMin: 10000,
    discount: 30,
    creditLimit: 5000,
    Icon: BuildingOffice2Icon,
    color: '#0f172a',
    gradient: 'linear-gradient(135deg, #0f172a, #1e40af)',
    features: [
      'Everything in Pro',
      'Negotiated custom rates (up to 30%+)',
      '$5,000+ credit facility',
      'Dedicated infrastructure',
      'White-label options',
      'Direct API integration',
      'Named account executive',
      '24 / 7 phone support',
    ],
  },
];

// ── PackageCard ────────────────────────────────────────────────────────────────
const PackageCard = ({ pkg, selected, onSelect }: { pkg: PackageTier; selected: boolean; onSelect: () => void }) => {
  const [hovered, setHovered] = useState(false);
  const active = hovered || selected;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 20,
        padding: '1.75rem 1.5rem',
        cursor: 'pointer',
        position: 'relative',
        border: selected ? `2px solid ${pkg.color}` : '2px solid transparent',
        boxShadow: active
          ? `0 12px 36px rgba(0,0,0,0.12), 0 0 0 ${selected ? 0 : 1}px ${pkg.color}40`
          : '0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transform: active ? 'translateY(-4px)' : 'none',
        transition: 'all 0.2s ease',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: pkg.gradient, borderRadius: '18px 18px 0 0',
      }} />

      {/* Badge */}
      {pkg.badge && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          background: pkg.gradient, color: '#fff',
          fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em',
          padding: '3px 10px', borderRadius: 99, textTransform: 'uppercase',
        }}>
          {pkg.badge}
        </div>
      )}

      {/* Icon + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.1rem' }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12,
          background: `${pkg.color}18`, border: `1px solid ${pkg.color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <pkg.Icon style={{ width: 22, height: 22, color: pkg.color }} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{pkg.name}</h3>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{pkg.tagline}</p>
        </div>
      </div>

      {/* Discount callout */}
      <div style={{
        background: `${pkg.color}0f`, border: `1px solid ${pkg.color}20`,
        borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Label Discount</p>
          <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: pkg.color, lineHeight: 1.1 }}>
            {pkg.discount}% <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>off retail</span>
          </p>
        </div>
        {pkg.creditLimit > 0 && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credit Facility</p>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              ${pkg.creditLimit.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Monthly minimum */}
      {pkg.monthlyMin > 0 && (
        <p style={{ margin: '0 0 1rem', fontSize: '0.74rem', color: '#64748b' }}>
          <span style={{ color: '#0f172a', fontWeight: 700 }}>${pkg.monthlyMin.toLocaleString()}</span> monthly minimum spend
        </p>
      )}
      {pkg.monthlyMin === 0 && (
        <p style={{ margin: '0 0 1rem', fontSize: '0.74rem', color: '#64748b' }}>No minimum spend required</p>
      )}

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, marginBottom: '1.25rem' }}>
        {pkg.features.map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              background: `${pkg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckIcon style={{ width: 10, height: 10, color: pkg.color, strokeWidth: 3 }} />
            </div>
            <span style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.45 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <a
        href={`mailto:support@shipmehub.com?subject=Package%20Inquiry%20%E2%80%94%20ShipmeHub&body=Hi%2C%20I%27m%20interested%20in%20the%20${encodeURIComponent(pkg.name)}%20package.`}
        onClick={e => e.stopPropagation()}
        style={{
          display: 'block', textAlign: 'center',
          padding: '0.7rem', borderRadius: 10,
          background: selected ? pkg.gradient : '#f1f5f9',
          border: `1px solid ${selected ? 'transparent' : '#e2e8f0'}`,
          color: selected ? '#fff' : '#0f172a',
          fontSize: '0.8rem', fontWeight: 700,
          textDecoration: 'none', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = `${pkg.color}18`; }}
        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = '#f1f5f9'; }}
      >
        Contact Sales →
      </a>
    </div>
  );
};

// ── Packages Page ──────────────────────────────────────────────────────────────
const Packages: React.FC = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0.5rem' }}>

      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #1e3a8a 100%)',
        borderRadius: 20, padding: '2.5rem 2.5rem', marginBottom: '2rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 80% at 10% 50%, rgba(59,130,246,0.18) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(148,163,184,0.8)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Pricing & Plans
          </p>
          <h1 style={{ margin: '0 0 8px', fontSize: '1.8rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.025em' }}>
            Choose Your Package
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', maxWidth: 480 }}>
            All plans include access to USPS, UPS, FedEx, and DHL. Discounts are estimated vs standard retail rates. Contact sales to activate or upgrade your plan.
          </p>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {PACKAGES.map(pkg => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            selected={selected === pkg.id}
            onSelect={() => setSelected(pkg.id === selected ? null : pkg.id)}
          />
        ))}
      </div>

      {/* Footnote */}
      <div className="sh-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>ℹ️</span>
        <div>
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-700)' }}>How discounts work</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--navy-500)', lineHeight: 1.55 }}>
            Discounts are applied against standard USPS retail / carrier published rates at the time of label generation.
            Final pricing depends on package weight, dimensions, zone, and carrier. All figures are estimates and may vary.
            Your account manager can provide exact rates for your typical shipment profile.
          </p>
          <button
            onClick={() => navigate('/credit')}
            style={{
              marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent-600)', fontWeight: 700, fontSize: '0.78rem', padding: 0,
            }}
          >
            View your credit score →
          </button>
        </div>
      </div>
    </div>
  );
};

export default Packages;
