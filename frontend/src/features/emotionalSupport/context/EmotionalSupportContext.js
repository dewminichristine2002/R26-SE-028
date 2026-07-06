import React, { createContext, useContext, useMemo } from 'react';

const EmotionalSupportContext = createContext({
  elderId: 1,
  caregiverId: 1,
});

export function EmotionalSupportProvider({ children }) {
  const value = useMemo(
    () => ({
      elderId: 1,
      caregiverId: 1,
    }),
    []
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
