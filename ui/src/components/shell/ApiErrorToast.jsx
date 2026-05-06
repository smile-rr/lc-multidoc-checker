import React, { useEffect, useState } from 'react';

/**
 * Listens for `api-error` window events dispatched by api.js and renders
 * a stack of dismissible toasts in the top-right. Catches every API failure,
 * including ones swallowed by `.catch(() => …)` in callers.
 */
export function ApiErrorToast() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let nextId = 1;
    function onErr(e) {
      const { status, url, method, message } = e.detail || {};
      const id = nextId++;
      setItems(prev => [...prev, { id, status, url, method, message }]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), 12000);
    }
    window.addEventListener('api-error', onErr);
    return () => window.removeEventListener('api-error', onErr);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 max-w-md">
      {items.map(item => (
        <div
          key={item.id}
          className="bg-status-redSoft border border-[#fca5a5] rounded shadow-md px-3 py-2 text-[12px] text-status-red"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold font-mono text-[11px]">
                {item.method || 'GET'} {item.url} → {item.status || 'network'}
              </div>
              <div className="mt-1 break-words font-mono text-[10px] opacity-80">
                {item.message}
              </div>
            </div>
            <button
              onClick={() => setItems(prev => prev.filter(x => x.id !== item.id))}
              className="text-[#a1a1a6] hover:text-status-red text-[12px] shrink-0"
              aria-label="dismiss"
            >✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
