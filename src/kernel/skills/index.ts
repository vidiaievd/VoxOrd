// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/skills/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// Public surface of the skill axes — plan 55 phase 1.

export type { Focus, FocusSource, Form, Input, Modality, Output, Skill, SkillSource } from './model';
export {
  channelsOf,
  FOCUS_SOURCES,
  FOCUSES,
  FORMS,
  INPUTS,
  MODALITIES,
  OUTPUTS,
  isFocus,
  isInput,
  isModality,
  isOutput,
  isSkill,
  orderFocuses,
  orderSkills,
  parseFocuses,
  parseSkills,
  SKILL_SOURCES,
  SKILLS,
} from './model';

export type { TemplateProfile } from './by-template';
export { BY_TEMPLATE, templateProfile } from './by-template';

export type { AtomRef, DeriveInput, DerivedProfile, Placement, SkillOverride } from './derive';
export { deriveSkills, structuralFocus } from './derive';

export type {
  Coverage,
  CoverageDifference,
  FocusTally,
  FormTally,
  ModalityTally,
  PairTally,
  SkillTally,
} from './coverage';
export { coverage, diff, diverges, share, tally } from './coverage';

export type { CoverageIssue, CoverageIssueLevel, CoverageIssueOptions } from './issues';
export { coverageIssues, warnings } from './issues';

export type { Recipe, RecipeAxis, RecipeElement, RecipeIssue, RecipePresetId, RecipeRule } from './recipe';
export {
  checkElements,
  checkRecipe,
  elementsOf,
  EMPTY_RECIPE,
  matches,
  MAX_RECIPE_RULES,
  parseRecipe,
  parseRule,
  readRecipe,
  RECIPE_AXES,
  RECIPE_PRESET_IDS,
  RECIPE_PRESETS,
} from './recipe';
