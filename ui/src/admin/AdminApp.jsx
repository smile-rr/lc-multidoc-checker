import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RoleProvider } from './RoleContext';
import { AdminShell } from './AdminShell';
import { DashboardPage } from './pages/DashboardPage';
import { RulesPage } from './pages/RulesPage';
import { RuleDetailPage } from './pages/RuleDetailPage';
import { PromptsPage } from './pages/PromptsPage';
import { PromptDetailPage } from './pages/PromptDetailPage';
import { FieldsPage } from './pages/FieldsPage';
import { FieldDetailPage } from './pages/FieldDetailPage';
import { RefsPage } from './pages/RefsPage';
import { LifecyclePage } from './pages/LifecyclePage';

export function AdminApp() {
  return (
    <RoleProvider>
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="rules/:ruleId" element={<RuleDetailPage />} />
          <Route path="prompts" element={<PromptsPage />} />
          <Route path="prompts/*" element={<PromptDetailPage />} />
          <Route path="fields" element={<FieldsPage />} />
          <Route path="fields/:key" element={<FieldDetailPage />} />
          <Route path="refs" element={<RefsPage />} />
          <Route path="lifecycle" element={<LifecyclePage />} />
        </Route>
      </Routes>
    </RoleProvider>
  );
}
