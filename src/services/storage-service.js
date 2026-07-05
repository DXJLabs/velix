export function readJsonStorage(key, fallback = null) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  return JSON.parse(raw);
}

export function writeJsonStorage(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listStorageKeys(prefix = "") {
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!prefix || key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

export function removeStorageKeys(keys) {
  keys.forEach((key) => window.localStorage.removeItem(key));
}
