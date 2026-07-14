import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import './Header.css';

const NAV_LINKS = [
  { label: 'DASHBOARD', to: '/dashboard' },
  { label: 'SESSIONS', to: '/sessions/new' },
  { label: 'ABOUT', to: '/' },
  { label: 'LOGIN', to: '/login' },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    `nav-link${isActive ? ' nav-link--active' : ''}`;

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand" aria-label="AI Learning Coach home">
          <span className="brand__mark">◆</span>
          <span className="brand__text">AI Learning Coach</span>
        </Link>

        <nav className="desktop-nav">
          {NAV_LINKS.map((l) => (
            <NavLink key={l.label} to={l.to} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button
          className="menu-toggle"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={24} />
        </button>
      </div>

      {menuOpen && (
        <div className="mobile-overlay" role="dialog" aria-modal="true">
          <button
            className="mobile-overlay__close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={28} />
          </button>
          <nav className="mobile-nav">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.label}
                to={l.to}
                className={linkClass}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
