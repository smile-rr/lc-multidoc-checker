import React from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { SessionStatusProvider } from './context/SessionStatusContext';
import { DevModeProvider } from './context/DevModeContext';
import { UploadDraftProvider } from './context/UploadDraftContext';
import { TopNav } from './components/shell/TopNav';
import { DevModeBanner } from './components/shell/DevModeBanner';
import { ApiErrorToast } from './components/shell/ApiErrorToast';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { AdminApp } from './admin/AdminApp';

function KeyedSessionPage() {
  const { id } = useParams();
  return <SessionPage key={id ?? 'none'} />;
}

export function App() {
  return (
    <DevModeProvider>
      <UploadDraftProvider>
      <SessionStatusProvider>
        <div className="h-dvh flex flex-col overflow-hidden">
          <TopNav />
          <DevModeBanner />
          <ApiErrorToast />
          <main className="flex-1 min-h-0 overflow-hidden">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/session/:id" element={<KeyedSessionPage />} />
              <Route path="/admin/*" element={<AdminApp />} />
            </Routes>
          </main>
        </div>
      </SessionStatusProvider>
      </UploadDraftProvider>
    </DevModeProvider>
  );
}
