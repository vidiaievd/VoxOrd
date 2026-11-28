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

function countFor(userId: string | null): number {
  return (
    reviewQueueStore.pendingCountFor(userId) +
    wordCaptureQueueStore.pendingCountFor(userId) +
    exerciseOutboxStore.pendingCountFor(userId)
  );
}

/**
 * What a given learner still has waiting — for a session the server ended (OQ-52), when
 * nobody is signed in and `usePendingSync` counts nothing. They go out on that learner's
 * next sign-in, so the count is kept, not dropped.
 */
export function usePendingSyncOf(userId: string | null): number {
  const [pending, setPending] = useState(() => countFor(userId));

  useEffect(() => {
    const update = () => setPending(countFor(userId));
    const unsubscribes = [
      reviewQueueStore.subscribe(update),
      wordCaptureQueueStore.subscribe(update),
      exerciseOutboxStore.subscribe(update),
    ];
    void reviewQueueStore.load();
    void wordCaptureQueueStore.load();
    void exerciseOutboxStore.load();
    update();
    return () => unsubscribes.forEach(u => u());
  }, [userId]);

  return pending;
}

function nearlyFull(): boolean {
  return reviewQueueStore.nearlyFull || exerciseOutboxStore.nearlyFull;
}

/**
 * A queue close to its cap (offline plan, B7.5): past it the oldest work is dropped, and the
 * schedule never hears of it. The learner is told while connecting can still save it.
 */
export function useSyncQueueNearlyFull(): boolean {
  const [full, setFull] = useState(nearlyFull);

  useEffect(() => {
    const update = () => setFull(nearlyFull());
    const unsubscribes = [reviewQueueStore.subscribe(update), exerciseOutboxStore.subscribe(update)];
    update();
    return () => unsubscribes.forEach(u => u());
  }, []);

  return full;
}

/**
 * Answers given offline that the learner's school refused as read only on sync (plan 90,
 * phase 5). Kept on the phone and tried again; they go out once the school reopens.
 */
export function useHeldBySchool(): number {
  const [held, setHeld] = useState(() => exerciseOutboxStore.heldBySchoolCount);

  useEffect(() => {
    const update = () => setHeld(exerciseOutboxStore.heldBySchoolCount);
    const unsubscribes = [exerciseOutboxStore.subscribe(update), authStore.subscribe(update)];
    void exerciseOutboxStore.load();
    update();
    return () => unsubscribes.forEach(u => u());
  }, []);

  return held;
}

/**
 * Answers given offline that a purged school will never take (plan 90, Q16): dropped from the
 * queue and counted until the learner has read the notice.
 */
export function useDiscardedBySchool(): number {
  const [discarded, setDiscarded] = useState(() => exerciseOutboxStore.discardedBySchoolCount);

  useEffect(() => {
    const update = () => setDiscarded(exerciseOutboxStore.discardedBySchoolCount);
    const unsubscribes = [exerciseOutboxStore.subscribe(update), authStore.subscribe(update)];
    void exerciseOutboxStore.load();
    update();
    return () => unsubscribes.forEach(u => u());
  }, []);

  return discarded;
}
