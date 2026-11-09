import { contentIcon } from './contentIcon';
import { ICON_NAMES } from '../../components/ui/Icon';
import type { ExerciseTemplateCode } from '../../api/types';

const TEMPLATES: ExerciseTemplateCode[] = [
  'multiple_choice',
  'fill_in_blank',
  'translate_to_target',
  'translate_from_target',
  'match_pairs',
  'short_answer',
  'writing_task',
  'sentence_schema',
  'multiple_choice_group',
  'sort_into_buckets',
  'highlight_in_text',
  'dictation',
  'inflection_table',
  'read_aloud',
  'minimal_pairs',
  'information_transfer',
  'word_bank_gap_fill',
  'error_correction',
  'text_order',
];

const ex = { contentType: 'exercise', lessonKind: null } as const;

describe('contentIcon', () => {
  it('maps lessons by kind', () => {
    expect(contentIcon({ contentType: 'lesson', lessonKind: 'text' })).toBe('BookOpenText');
    expect(contentIcon({ contentType: 'lesson', lessonKind: 'audio' })).toBe('Headphones');
    expect(contentIcon({ contentType: 'lesson', lessonKind: null })).toBe('BookOpenText');
  });

  it('maps vocabulary and grammar', () => {
    expect(contentIcon({ contentType: 'vocabulary_list', lessonKind: null })).toBe('Translate');
    expect(contentIcon({ contentType: 'grammar_rule', lessonKind: null })).toBe('TreeStructure');
  });

  it('maps exercises by template', () => {
    expect(contentIcon(ex, 'fill_in_blank')).toBe('PencilSimpleLine');
    expect(contentIcon(ex, 'word_bank_gap_fill')).toBe('PencilSimpleLine');
    expect(contentIcon(ex, 'multiple_choice_group')).toBe('ListChecks');
    expect(contentIcon(ex, 'text_order')).toBe('ArrowsDownUp');
    expect(contentIcon(ex, 'sentence_schema')).toBe('ArrowsDownUp');
    expect(contentIcon(ex, 'writing_task')).toBe('EnvelopeSimple');
    expect(contentIcon(ex, 'read_aloud')).toBe('Microphone');
    expect(contentIcon(ex, 'minimal_pairs')).toBe('Ear');
    expect(contentIcon(ex, 'dictation')).toBe('Ear');
    expect(contentIcon(ex, 'match_pairs')).toBe('SquaresFour');
    expect(contentIcon(ex, 'sort_into_buckets')).toBe('SquaresFour');
    expect(contentIcon(ex, 'translate_to_target')).toBe('Translate');
    expect(contentIcon(ex, 'translate_from_target')).toBe('Translate');
  });

  it('falls back to Exam for other, unknown or missing templates', () => {
    expect(contentIcon(ex)).toBe('Exam');
    expect(contentIcon(ex, 'something_new')).toBe('Exam');
    expect(contentIcon(ex, 'inflection_table')).toBe('Exam');
  });

  it('returns a registered icon for every template', () => {
    for (const t of TEMPLATES) {
      expect(ICON_NAMES).toContain(contentIcon(ex, t));
    }
  });
});
