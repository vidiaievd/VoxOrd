import type { IconName } from '../../components/ui/Icon';
import type {
  ExerciseTemplateCode,
  UnitContentsItem,
} from '../../api/types';

// Courses spec §7.2: the icon of a unit row by content type, lesson kind and
// (for exercises) template. The unit-contents payload carries no template
// code yet, so the template is an optional second argument; without it every
// exercise gets the generic `Exam` icon.
const EXERCISE_ICON: Record<ExerciseTemplateCode, IconName> = {
  fill_in_blank: 'PencilSimpleLine',
  word_bank_gap_fill: 'PencilSimpleLine',
  multiple_choice: 'ListChecks',
  multiple_choice_group: 'ListChecks',
  text_order: 'ArrowsDownUp',
  sentence_schema: 'ArrowsDownUp',
  writing_task: 'EnvelopeSimple',
  read_aloud: 'Microphone',
  minimal_pairs: 'Ear',
  dictation: 'Ear',
  match_pairs: 'SquaresFour',
  sort_into_buckets: 'SquaresFour',
  translate_to_target: 'Translate',
  translate_from_target: 'Translate',
  short_answer: 'Exam',
  highlight_in_text: 'Exam',
  inflection_table: 'Exam',
  information_transfer: 'Exam',
  error_correction: 'Exam',
};

export function contentIcon(
  item: Pick<UnitContentsItem, 'contentType' | 'lessonKind'>,
  template?: string | null,
): IconName {
  switch (item.contentType) {
    case 'lesson':
      return item.lessonKind === 'audio' ? 'Headphones' : 'BookOpenText';
    case 'vocabulary_list':
      return 'Translate';
    case 'grammar_rule':
      return 'TreeStructure';
    case 'exercise':
      return (
        EXERCISE_ICON[template as ExerciseTemplateCode] ?? 'Exam'
      );
    default:
      return 'Exam';
  }
}
