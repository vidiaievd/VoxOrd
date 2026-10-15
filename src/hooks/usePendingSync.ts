import { useEffect, useState } from 'react';
import { authStore } from '../store/authStore';
import { reviewQueueStore } from '../store/reviewQueueStore';
import { wordCaptureQueueStore } from '../store/wordCaptureQueueStore';
import { exerciseOutboxStore } from '../store/exerciseOutboxStore';

function count(): number {
  return (
    reviewQueueStore.pendingCount +
    wordCaptureQueueStore.pendingCount +
    exerciseOutboxStore.pendingCount
  );
}

/**
 * Everything of the signed-in learner still waiting for the server — answered cards and words
 * captured from texts. Follows the queues and the session: whose entries count changes with
 * who is signed in.
 */
export function usePendingSync(): number {
  const [pending, setPending] = useState(count);

  useEffect(() => {
    const update = () => setPending(count());
    const unsubscribes = [
      reviewQueueStore.subscribe(update),
      wordCaptureQueueStore.subscribe(update),
      exerciseOutboxStore.subscribe(update),
      authStore.subscribe(update),
    ];
    // The queues load from storage lazily; a load that already happened is picked up here.
    void reviewQueueStore.load();
    void wordCaptureQueueStore.load();
    void exerciseOutboxStore.load();
    update();
    return () => unsubscribes.forEach(u => u());
  }, []);

  return pending;
}
