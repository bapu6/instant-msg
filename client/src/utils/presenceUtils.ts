/**
 * Format a last seen ISO timestamp into friendly readable text
 * e.g. "Last seen just now", "Last seen 5m ago", "Last seen today at 2:30 PM", "Last seen yesterday"
 */
export function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';

  try {
    const date = new Date(lastSeen);
    if (isNaN(date.getTime())) return 'Offline';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Last seen just now';

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'Last seen just now';
    }
    if (diffMinutes < 60) {
      return `Last seen ${diffMinutes}m ago`;
    }

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `Last seen today at ${timeStr}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
      return `Last seen yesterday at ${timeStr}`;
    }

    if (diffDays < 7) {
      const weekday = date.toLocaleDateString([], { weekday: 'short' });
      return `Last seen ${weekday} at ${timeStr}`;
    }

    return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  } catch {
    return 'Offline';
  }
}
