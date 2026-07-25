import { apiClient } from './client';
import type { CourseMastery, SkillMastery } from './types';

const COURSE_MASTERY_PATH = (courseId: string) => `/api/v1/mastery/course/${courseId}`;

/**
 * `GET /mastery/course/:containerId` (learning-service). Confirmed against
 * services/learning-service/src/modules/srs/presentation/mastery.controller.ts
 * and get-course-mastery.handler.ts — proxied by the gateway's existing
 * `location /api/v1/mastery` block (no gateway gap here, unlike can-do/
 * descriptors and content-relations, see the plan's Phase 6 gateway note).
 * Every field is a 0..1 fraction; the UI wants percentages.
 */
interface RawCourseMastery {
  containerId: string;
  vocab: number;
  grammar: number;
  reading: number;
  listening: number;
  spoken: number;
  written: number;
  overall: number;
}

function skill(id: string, fraction: number): SkillMastery {
  return { skill: id, masteryPercent: Math.round(fraction * 100) };
}

export async function getCourseMastery(courseId: string): Promise<CourseMastery> {
  const raw = await apiClient.get<RawCourseMastery>(COURSE_MASTERY_PATH(courseId));
  return {
    courseId: raw.containerId,
    overallMastery: Math.round(raw.overall * 100),
    bySkill: [
      skill('vocabulary', raw.vocab),
      skill('grammar', raw.grammar),
      skill('reading', raw.reading),
      skill('listening', raw.listening),
      skill('speaking', raw.spoken),
      skill('writing', raw.written),
    ],
  };
}
