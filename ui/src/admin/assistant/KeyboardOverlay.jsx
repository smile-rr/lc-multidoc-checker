import React from 'react';

const ROWS = [
  ['g a', 'jump to Assistant'],
  ['g r', 'jump to Rules'],
  ['g p', 'jump to Prompts'],
  ['g f', 'jump to Fields'],
  ['⌘ ↵', 'send composer'],
  ['Esc', 'cancel / close menu'],
  ['↑',   'recall previous turn'],
  ['/',   'open slash-menu'],
  ['a',   'apply patch (focused)'],
  ['e',   'edit patch (focused)'],
  ['x',   'reject patch (focused)'],
  ['n',   'new thread'],
  ['?',   'show this card'],
];

export function KeyboardOverlay({ onClose }) {
  return (
    <div className="kbd-overlay" onClick={onClose} role="dialog" aria-label="Keyboard shortcuts">
      <div className="kbd-card" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard quick-reference</h2>
        <div className="kbd-grid">
          {ROWS.map(([k, d]) => (
            <div key={k}>
              {k.split(' ').map((kk, i) => <kbd key={i}>{kk}</kbd>)}
              <span className="desc">{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
