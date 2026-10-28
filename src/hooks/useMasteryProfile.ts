import { useCallback } from 'react';
import { getMasteryProfile, type MasteryProfile } from '../api/masteryProfile';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface MasteryProfileState {
  /** null: «we cannot say» — not the same as a profile with no cells; block 11 is silent for both. */
  profile: MasteryProfile | null;
  refresh: () => Promise<void>;
}

/** The learner's whole-platform skill profile, cached per user. */
export function useMasteryProfile(): MasteryProfileState {
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;
  const loader = useCallback(() => getMasteryProfile(), []);
  const { data, refresh } = useSwrResource<MasteryProfile | null>(
    userId ? `masteryProfile:${userId}` : null,
    loader,
  );
  return { profile: data ?? null, refresh };
}
