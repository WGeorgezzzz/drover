import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'claude-workspace-split';
const CHANGE_EVENT = 'drover:workspace-layout';
const subscribe = (notify: () => void) => {
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
};

/** Settings and the workspace share the existing device-local split preference. */
export function useWorkspaceLayoutPreference() {
  const enabled = useSyncExternalStore(subscribe, () => localStorage.getItem(STORAGE_KEY) !== 'false');
  const setEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [enabled, setEnabled] as const;
}
