import React, { createContext, useContext, useState } from 'react';
import seed from './mockData.json';

const Ctx = createContext(null);

export function RoleProvider({ children }) {
  const [roleId, setRoleId] = useState('maya');
  const role = seed.users.find((u) => u.id === roleId) || seed.users[0];
  const can = (cap) => role.owns.includes(cap);
  return (
    <Ctx.Provider value={{ role, roleId, setRoleId, can, users: seed.users }}>
      {children}
    </Ctx.Provider>
  );
}

export const useRole = () => useContext(Ctx);
