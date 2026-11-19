const STORAGE_KEY = 'duo:message-outbox';
const MAX_ENTRIES = 100;

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Private browsing or a full quota: retry in memory for this session only.
  }
}

/** Messages still waiting to be delivered, optionally scoped to one account. */
export function listQueued(userId = null) {
  const entries = read();
  return userId ? entries.filter((entry) => entry.userId === userId) : entries;
}

/** Remember a failed send so it can be retried after a reload or reconnect. */
export function enqueue(entry) {
  if (!entry?.clientId) return;
  const entries = read();
  if (entries.some((item) => item.clientId === entry.clientId)) return;
  write([...entries, entry]);
}

export function dequeue(clientId) {
  if (!clientId) return;
  write(read().filter((entry) => entry.clientId !== clientId));
}

export function clearOutbox() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
