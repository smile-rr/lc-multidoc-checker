import React from 'react';

const ITEMS = [
  { cmd: '/rule',    desc: 'reference a catalogue rule by id' },
  { cmd: '/prompt',  desc: 'reference a prompt by id' },
  { cmd: '/field',   desc: 'reference a canonical field key' },
  { cmd: '/cite',    desc: 'pin a UCP/ISBP paragraph (e.g. /cite ucp 14-h)' },
  { cmd: '/session', desc: 'pull a fixture session into context (e.g. /session 214)' },
];

export function SlashMenu({ filter = '', onPick }) {
  const items = ITEMS.filter((i) => !filter || i.cmd.startsWith('/' + filter.toLowerCase().replace(/^\//, '')));
  if (!items.length) return null;
  return (
    <div className="slash-menu" role="listbox">
      {items.map((i, idx) => (
        <div
          key={i.cmd}
          className="slash-menu-item"
          data-active={idx === 0}
          onMouseDown={(e) => { e.preventDefault(); onPick(i.cmd + ' '); }}
        >
          <span style={{ minWidth: 80 }}>{i.cmd}</span>
          <span className="desc">{i.desc}</span>
        </div>
      ))}
    </div>
  );
}
