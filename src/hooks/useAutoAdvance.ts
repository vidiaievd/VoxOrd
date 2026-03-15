import { useEffect, useRef } from 'react';

const AUTO_ADVANCE_DELAY_MS = 800;

export function useAutoAdvance(
  isAnswered: boolean,
  isCorrect: boolean | null,
  onNext: () => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only auto-advance on correct answer
    console.log({isCorrect})
    if (isAnswered && isCorrect === true) {
      timerRef.current = setTimeout(onNext, AUTO_ADVANCE_DELAY_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAnswered, isCorrect, onNext]);
}
