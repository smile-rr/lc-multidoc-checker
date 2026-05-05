import React, { useState } from 'react';
import { useRole } from '../RoleContext';

export function RoleSwitcher() {
  const { role, users, setRoleId } = useRole();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs px-2.5 py-1 rounded border border-line hover:bg-slate2 transition"
        title="View as — demonstrates role-based ownership"
      >
        <span className="w-5 h-5 rounded-full bg-navy-2 text-white text-[10px] font-bold flex items-center justify-center">
          {role.avatar}
        </span>
        <span className="text-left leading-tight">
          <span className="block font-medium">{role.name}</span>
          <span className="block text-[10px] text-muted">{role.role}</span>
        </span>
        <span className="text-muted text-[10px]">▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-64 bg-paper border border-line rounded shadow-lg z-50"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted border-b border-line">
            View as
          </div>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => { setRoleId(u.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate2 flex items-center gap-2 ${role.id === u.id ? 'bg-slate2' : ''}`}
            >
              <span className="w-6 h-6 rounded-full bg-navy-2 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {u.avatar}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{u.name}</span>
                <span className="block text-[10px] text-muted">{u.role}</span>
              </span>
              {role.id === u.id && <span className="text-teal-1 text-[10px]">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
