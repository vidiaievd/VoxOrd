import { useState, useEffect } from 'react';
import { authStore, AuthState } from '../store/authStore';

export function useAuth(): AuthState {
  const [state, setState] = useState(authStore.getState());

  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      setState(authStore.getState());
    });
    return unsubscribe;
  }, []);

  return state;
}
