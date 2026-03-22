import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  HomeIcon,
  UserGroupIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  TruckIcon,
  TagIcon,
  ClipboardDocumentListIcon,
  RectangleStackIcon,
  BuildingStorefrontIcon,
  Squares2X2Icon,
  SignalIcon,
  BanknotesIcon,
  BookOpenIcon,
  PresentationChartLineIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  BellIcon,
  MegaphoneIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  current: boolean;
}

interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

const COLLAPSED_KEY = 'sh_sidebar_collapsed';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [collapsed, setCollapsed]       = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true, labels: true, management: true, account: true,
  });
  const [tooltip, setTooltip] = useState<{ name: string; y: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user, logout } = useAuth();
  const location         = useLocation();
  const navigate         = useNavigate();

  // Persist collapse state + sync CSS variable for fixed-position children
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '72px' : '256px');
  }, [collapsed]);

  // Auto-expand sidebar on mobile breakpoint
  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 768) setCollapsed(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Navigation definitions ──────────────────────────────────────────────
  const overviewNav: NavItem[] = [
    { name: 'Dashboard',      href: '/dashboard',      icon: HomeIcon,      current: location.pathname === '/dashboard' },
    { name: 'Announcements',  href: '/announcements',  icon: MegaphoneIcon, current: location.pathname === '/announcements' },
    { name: 'Live Activity',  href: '/activity',       icon: SignalIcon,    current: location.pathname === '/activity'  },
  ];

  const labelsNav: NavItem[] = [
    { name: 'Single Label',   href: '/labels/single',       icon: TagIcon,                   current: location.pathname === '/labels/single' },
    { name: 'Bulk Labels',    href: '/labels/bulk',          icon: RectangleStackIcon,        current: location.pathname === '/labels/bulk' },
    { name: 'Single History', href: '/labels/history',      icon: ClipboardDocumentListIcon, current: location.pathname === '/labels/history' },
    { name: 'Bulk History',   href: '/labels/bulk-history', icon: ClipboardDocumentListIcon, current: location.pathname === '/labels/bulk-history' },
  ];

  const adminItems: NavItem[] = user?.role === 'admin' ? [
    { name: 'Admin Panel',         href: '/admin',                     icon: UserGroupIcon,             current: location.pathname === '/admin' },
    { name: 'Users',               href: '/admin/users',               icon: UserGroupIcon,             current: location.pathname.startsWith('/admin/users') },
    { name: 'Vendors',             href: '/admin/vendors',             icon: BuildingStorefrontIcon,    current: location.pathname === '/admin/vendors' },
    { name: 'Manifest Ops',        href: '/admin/manifest',            icon: Squares2X2Icon,            current: location.pathname === '/admin/manifest' },
    { name: 'Sales Team',          href: '/admin/sales-agents',        icon: UserGroupIcon,             current: location.pathname === '/admin/sales-agents' },
    { name: 'Finance',             href: '/admin/finance',             icon: BanknotesIcon,             current: location.pathname === '/admin/finance' },
    { name: 'Cash Book',           href: '/admin/cashbook',            icon: BookOpenIcon,              current: location.pathname === '/admin/cashbook' },
    { name: 'Financial Dashboard', href: '/admin/financial-dashboard', icon: PresentationChartLineIcon, current: location.pathname === '/admin/financial-dashboard' },
  ] : user?.role === 'reseller' ? [
    { name: 'My Clients', href: '/reseller/clients', icon: UserGroupIcon, current: location.pathname.startsWith('/reseller/clients') },
    { name: 'Finance',    href: '/reseller/finance', icon: BanknotesIcon, current: location.pathname === '/reseller/finance' },
  ] : [];

  const accountNav: NavItem[] = [
    { name: 'Profile', href: '/profile', icon: UserIcon, current: location.pathname === '/profile' },
  ];

  const sections: NavSection[] = [
    { key: 'overview',    label: 'Overview',    items: overviewNav  },
    { key: 'labels',      label: 'Labels',      items: labelsNav    },
    ...(adminItems.length > 0 ? [{ key: 'management', label: 'Management', items: adminItems }] : []),
    { key: 'account',     label: 'Account',     items: accountNav   },
  ];

  const allNav    = [...overviewNav, ...labelsNav, ...adminItems, ...accountNav];
  const activePage = allNav.find(n => n.current);
  const activeSection = sections.find(s => s.items.some(i => i.name === activePage?.name));
  const initials  = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`;

  const roleChip = user?.role === 'admin'
    ? { bg: 'rgba(239,68,68,0.18)',    color: '#FCA5A5',  label: 'Admin'    }
    : user?.role === 'reseller'
    ? { bg: 'rgba(245,158,11,0.18)',   color: '#FCD34D',  label: 'Reseller' }
    : { bg: 'rgba(59,130,246,0.18)',   color: '#93C5FD',  label: 'User'     };

  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── NavLink ──────────────────────────────────────────────────────────────
  const NavLink = ({ item }: { item: NavItem }) => {
    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
      if (!collapsed) return;
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ name: item.name, y: rect.top + rect.height / 2 });
    }, [item.name]);

    const handleMouseLeave = useCallback(() => {
      tooltipTimer.current = setTimeout(() => setTooltip(null), 80);
    }, []);

    return (
      <div className="nav-item-wrapper">
        <Link
          to={item.href}
          className={`sidebar-link${item.current ? ' active' : ''}${collapsed ? ' icon-only' : ''}`}
          onClick={() => setSidebarOpen(false)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <item.icon className="nav-icon" />
          {!collapsed && <span className="nav-label">{item.name}</span>}
          {item.current && !collapsed && <span className="nav-active-dot" />}
        </Link>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 39,
            background: 'rgba(15,23,42,0.65)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>

        {/* Logo / brand */}
        <div className={`sidebar-logo${collapsed ? ' sidebar-logo-collapsed' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <div className="sidebar-logo-icon">
              <TruckIcon style={{ width: 18, height: 18, color: '#fff' }} />
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div className="sidebar-brand-name">ShipmeHub</div>
                <div className="sidebar-brand-sub">Label Portal</div>
              </div>
            )}
          </div>

          {/* Collapse toggle — desktop only */}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeftIcon
              style={{
                width: 13, height: 13,
                transition: 'transform var(--transition-base)',
                transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>

        {/* Mobile close */}
        <button
          className="sidebar-mobile-close"
          onClick={() => setSidebarOpen(false)}
        >
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>

        {/* ── Navigation ──────────────────────────────────────────────── */}
        <nav style={{ flex: 1, paddingTop: 6 }}>
          {sections.map((section, si) => (
            <div key={section.key} className={`sidebar-section${collapsed ? ' sidebar-section-collapsed' : ''}`}>

              {/* Section header (expanded mode) */}
              {!collapsed ? (
                <button
                  className="sidebar-section-btn"
                  onClick={() => toggleSection(section.key)}
                >
                  <span className="sidebar-nav-label">{section.label}</span>
                  <ChevronDownIcon
                    style={{
                      width: 11, height: 11,
                      color: 'rgba(255,255,255,0.25)',
                      flexShrink: 0,
                      transition: 'transform var(--transition-fast)',
                      transform: openSections[section.key] !== false ? 'rotate(0)' : 'rotate(-90deg)',
                    }}
                  />
                </button>
              ) : (
                si > 0 && <div className="sidebar-section-rule" />
              )}

              {/* Section items */}
              <div
                className="sidebar-section-items"
                style={{
                  maxHeight: collapsed || openSections[section.key] !== false ? '600px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {section.items.map(item => (
                  <NavLink key={item.name} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── User footer ─────────────────────────────────────────────── */}
        <div className={`sidebar-footer${collapsed ? ' sidebar-footer-collapsed' : ''}`}>
          {collapsed ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                <div className="avatar avatar-sm avatar-indigo" title={`${user?.firstName} ${user?.lastName} · ${user?.role}`}>
                  {initials}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={handleLogout} title="Sign out" className="sidebar-logout-btn">
                  <ArrowLeftOnRectangleIcon style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="avatar avatar-sm avatar-indigo">{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.firstName} {user?.lastName}
                </div>
                <span style={{
                  display: 'inline-block', marginTop: 2,
                  fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em',
                  textTransform: 'uppercase', padding: '1px 7px', borderRadius: 99,
                  background: roleChip.bg, color: roleChip.color,
                }}>
                  {roleChip.label}
                </span>
              </div>
              <button onClick={handleLogout} title="Sign out" className="sidebar-logout-btn">
                <ArrowLeftOnRectangleIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className={`main-content${collapsed ? ' sidebar-collapsed' : ''}`}>

        {/* Top bar */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-btn"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: 4, borderRadius: 6, display: 'none' }}
            >
              <Bars3Icon style={{ width: 22, height: 22 }} />
            </button>

            {/* Breadcrumb */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {activeSection && activePage && (
                <>
                  <span style={{ fontSize: '0.75rem', color: 'var(--navy-400)', fontWeight: 500 }}>
                    {activeSection.label}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--navy-300)' }}>/</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-800)' }}>
                    {activePage.name}
                  </span>
                </>
              )}
              {!activePage && (
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-800)' }}>Dashboard</span>
              )}
            </nav>
          </div>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

            {/* Notification bell */}
            <button className="topbar-icon-btn" title="Notifications">
              <BellIcon style={{ width: 17, height: 17 }} />
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: 'var(--navy-100)' }} />

            {/* User chip */}
            <div className="topbar-user-chip">
              <div className="avatar avatar-sm avatar-indigo">{initials}</div>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-900)' }}>
                  {user?.firstName} {user?.lastName}
                </div>
                <div style={{ fontSize: '0.67rem', color: 'var(--navy-500)', textTransform: 'capitalize' }}>
                  {user?.role}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          <div key={location.pathname} className="animate-fadeInUp">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Fixed tooltip — escapes sidebar overflow clipping */}
      {collapsed && tooltip && (
        <div
          style={{
            position: 'fixed',
            left: 82,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            animation: 'tooltipPop 0.12s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          {/* Arrow */}
          <div style={{
            width: 0, height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '6px solid #1e293b',
          }} />
          {/* Label */}
          <div style={{
            background: '#1e293b',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.08)',
            letterSpacing: '0.01em',
          }}>
            {tooltip.name}
          </div>
        </div>
      )}

      <style>{`
        @keyframes tooltipPop {
          from { opacity: 0; transform: translateY(-50%) scale(0.88) translateX(-6px); }
          to   { opacity: 1; transform: translateY(-50%) scale(1)    translateX(0); }
        }
        @media (max-width: 768px) {
          .mobile-menu-btn        { display: flex !important; }
          .sidebar-collapse-btn   { display: none !important; }
          .sidebar-mobile-close   { display: flex !important; }
        }
        @media (min-width: 769px) {
          .sidebar-mobile-close   { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default Layout;
