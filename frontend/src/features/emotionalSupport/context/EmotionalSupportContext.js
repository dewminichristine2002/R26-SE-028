import React, { createContext, useContext, useMemo } from 'react';

const EmotionalSupportContext = createContext({
  elderId: null,
});

export function EmotionalSupportProvider({ children, user }) {
  const value = useMemo(
    () => ({
      elderId: Number(user?.id) || null,
      user,
    }),
    [user]
  );

  return (
    <EmotionalSupportContext.Provider value={value}>
      {children}
    </EmotionalSupportContext.Provider>
  );
}

export function useEmotionalSupportContext() {
  return useContext(EmotionalSupportContext);
}
