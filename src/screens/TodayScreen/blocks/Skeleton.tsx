import React from 'react';
import { Skeleton } from '../../../components/ui';
import { radii } from '../../../theme/spacing';

/** Home spec §7: the first load shows blocks 4 and 5 as pulsing rectangles, nothing else. */
export function ResumeSkeleton() {
  return <Skeleton height={248} radius={radii.card} />;
}

export function ReviewSkeleton() {
  return <Skeleton height={76} radius={radii.card} />;
}
