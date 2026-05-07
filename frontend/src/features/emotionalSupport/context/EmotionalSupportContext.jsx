import React, { createContext, useContext, useMemo, useState } from 'react';
import { DEMO_CAREGIVER_ID, DEMO_ELDER_ID } from '../utils/demoIds';

const EmotionalSupportContext = createContext(null);

export function EmotionalSupportProvider({ children }) {
  const [elderId] = useState(DEMO_ELDER_ID);
  const [caregiverId] = useState(DEMO_CAREGIVER_ID);
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [lastActivityAttempt, setLastActivityAttempt] = useState(null);

  const value = useMemo(
    () => ({
      caregiverId,
      elderId,
      lastActivityAttempt,
      lastCheckIn,
      setLastActivityAttempt,
      setLastCheckIn,
    }),
    [caregiverId, elderId, lastActivityAttempt, lastCheckIn]
  );

  return (
    <EmotionalSupportContext.Provider value={value}>
      {children}
    </EmotionalSupportContext.Provider>
  );
}

export function useEmotionalSupportContext() {
  const context = useContext(EmotionalSupportContext);

  if (!context) {
    throw new Error('useEmotionalSupportContext must be used within EmotionalSupportProvider');
  }

  return context;
}
