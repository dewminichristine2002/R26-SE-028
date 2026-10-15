export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getSafeFirstName(user) {
  const candidates = [
    user?.firstName,
    user?.first_name,
    user?.displayName,
    user?.display_name,
    user?.fullName,
    user?.full_name,
  ];
  for (const candidate of candidates) {
    const clean = String(candidate || '').trim();
    if (!clean || clean.includes('@')) continue;
    const first = clean.split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '');
    if (first) return first;
  }
  return '';
}

export function getPersonalizedGreeting(user, date = new Date()) {
  const greeting = getTimeGreeting(date);
  const firstName = getSafeFirstName(user);
  return firstName ? `${greeting}, ${firstName}` : greeting;
}
