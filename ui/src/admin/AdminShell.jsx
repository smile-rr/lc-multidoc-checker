import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RoleSwitcher } from './components/RoleSwitcher';
import { useRole } from './RoleContext';
import { AssistantToggle } from './assistant/AssistantToggle';

const tabs = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/rules', label: 'Rules' },
  { to: '/admin/prompts', label: 'Prompts' },
  { to: '/admin/fields', label: 'Fields' },
  { to: '/admin/refs', label: 'UCP / ISBP' },
  { to: '/admin/lifecycle', label: 'Release' },
];

export function AdminShell() {
  const { role } = useRole();
  return (
    <div className="h-full flex flex-col" style={{ background: '#faf9f5' }}>
      <div className="bg-paper border-b border-line/70 px-6 pt-3 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted">Governance</span>
            <span className="text-muted text-xs">·</span>
            <span className="text-xs text-navy-1/80">Rule &amp; Prompt Console</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] text-muted hidden md:block">
              Acting as <span className="font-medium text-navy-1">{role.role}</span>
            </span>
            <RoleSwitcher />
            <AssistantToggle />
          </div>
        </div>
        <nav className="flex items-center gap-7 mt-3 -mb-px">
          {tabs.map((t, i) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `relative flex items-baseline gap-1.5 pb-2.5 text-[13px] transition group ${
                  isActive ? 'text-navy-1' : 'text-navy-1/55 hover:text-navy-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`text-[10px] font-mono tracking-wider ${
                      isActive ? 'text-teal-1' : 'text-navy-1/35'
                    }`}
                    style={{ fontFamily: 'ui-serif, Georgia, serif', fontStyle: 'italic' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={isActive ? 'font-medium' : ''}>{t.label}</span>
                  <span
                    className={`absolute left-0 right-0 -bottom-px h-[2px] bg-teal-1 transition-transform origin-left ${
                      isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100 group-hover:bg-line'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
