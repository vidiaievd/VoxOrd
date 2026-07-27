import { useState, useEffect } from 'react';
import { reviewQueueStore } from '../store/reviewQueueStore';

/** Reviews persisted but not yet accepted by the server. */
export function useReviewQueue(): number {
  const [pendingCount, setPendingCount] = useState(reviewQueueStore.pendingCount);

  useEffect(() => {
    const unsubscribe = reviewQueueStore.subscribe(() => {
      setPendingCount(reviewQueueStore.pendingCount);
    });
    return unsubscribe;
  }, []);

  return pendingCount;
}
