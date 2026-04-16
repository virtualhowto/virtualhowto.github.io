const KEY = 'timelapse-studio-session-v1';

export function saveSession(frames) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ frames, savedAt: Date.now() }));
    return true;
  } catch (e) {
    console.warn('Session save failed', e);
    return false;
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.frames) ? parsed.frames : [];
  } catch (e) {
    console.warn('Session load failed', e);
    return [];
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
