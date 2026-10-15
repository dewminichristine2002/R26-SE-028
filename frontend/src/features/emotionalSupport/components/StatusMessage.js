import React from 'react';
import { InlineState } from './WellnessUI';

export default function StatusMessage({ loading, error, empty, emptyText }) {
  return <InlineState loading={loading} error={Boolean(error)} empty={empty} emptyText={loading ? 'Loading your wellness activity...' : emptyText || 'No activity available yet.'} />;
}
