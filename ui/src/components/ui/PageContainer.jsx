import React from 'react';

const WIDTHS = {
  content:    'max-w-[1280px]',  // Home, Intake, Reconcile, Sign-off
  workbench:  'max-w-none',      // Parse, Examine — full bleed
  narrow:     'max-w-[640px]',   // SignedRecordView centered
};

/** Standard page-content container. Use one of: content | workbench | narrow. */
export function PageContainer({ variant = 'content', className = '', children }) {
  return (
    <div className={`${WIDTHS[variant]} mx-auto ${className}`}>
      {children}
    </div>
  );
}
