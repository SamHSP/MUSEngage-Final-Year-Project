export const getInitials = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'U';
  }
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || 'U';
};
