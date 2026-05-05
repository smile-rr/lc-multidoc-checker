import React from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { SessionStatusProvider } from './context/SessionStatusContext';
import { DevModeProvider } from './context/DevModeContext';
import { TopNav } from './components/shell/TopNav';
import { DevModeBanner } from './components/shell/DevModeBanner';
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
      <SessionStatusProvider>
        <div className="h-dvh flex flex-col overflow-hidden">
          <TopNav />
          <DevModeBanner />
          <main className="flex-1 min-h-0 overflow-hidden">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/session/:id" element={<KeyedSessionPage />} />
              <Route path="/admin/*" element={<AdminApp />} />
            </Routes>
          </main>
        </div>
      </SessionStatusProvider>
    </DevModeProvider>
  );
}
