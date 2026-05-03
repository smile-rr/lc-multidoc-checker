import React, { useEffect, useRef } from 'react';

/**
 * Thin draggable vertical handle.
 *
 * Visual: 1px line — same weight as the regular border, just teal on hover.
 * Hit zone: ~6px wide invisible padding around the line so the cursor doesn't
 * have to land pixel-perfect to grab it.
 */
export function ResizeHandle({ width, onResize, min = 360, max = 1200 }) {
  const startX = useRef(0);
  const startW = useRef(width);

  const onDown = (e) => {
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const onMove = (e) => {
    const dx = startX.current - e.clientX;
    const next = Math.max(min, Math.min(max, startW.current + dx));
    onResize(next);
  };
  const onUp = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  useEffect(() => () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onMouseDown={onDown}
      title="Drag to resize"
      className="group relative shrink-0 cursor-col-resize"
      style={{ width: 6, touchAction: 'none' }}
    >
      {/* The 1px visible line — sits centred inside the 6px hit zone */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-line group-hover:bg-teal-1 group-active:bg-teal-1 transition-colors" />
    </div>
  );
}
