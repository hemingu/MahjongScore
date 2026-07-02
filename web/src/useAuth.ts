import { useSyncExternalStore } from 'react';
import { getToken } from './api';

function subscribe(cb: () => void) {
  window.addEventListener('auth-changed', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('auth-changed', cb);
    window.removeEventListener('storage', cb);
  };
}

export function useAuth(): boolean {
  return useSyncExternalStore(subscribe, () => getToken() !== null);
}
