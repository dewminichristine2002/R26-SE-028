function formatDuration(milliseconds) {
  if (milliseconds == null || milliseconds === '') return '—';
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value < 0) return '—';

  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds} sec`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
}

module.exports = { formatDuration };
