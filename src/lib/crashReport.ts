import { Platform } from 'react-native';
import { formatBuildLabel, type BuildInfo } from './buildInfo';

/**
 * The screen on show, kept by the navigator, so a crash report says where it happened.
 * A plain module value: the error boundary sits outside the navigator and has no other
 * way to see its state.
 */
let currentScreen = 'unknown';

export function setCurrentScreen(name: string): void {
  currentScreen = name;
}

export function getCurrentScreen(): string {
  return currentScreen;
}

export interface CrashReportInput {
  error: unknown;
  /** React's component stack, when the error came through a boundary. */
  componentStack?: string | null;
  screen: string;
  build: BuildInfo;
  at: Date;
}

/** Stacks are long; a report pasted into a messenger keeps the top of each. */
const MAX_STACK_LINES = 25;

function trimStack(stack: string): string {
  const lines = stack.trim().split('\n');
  return lines.length > MAX_STACK_LINES
    ? [...lines.slice(0, MAX_STACK_LINES), `… ${lines.length - MAX_STACK_LINES} more`].join('\n')
    : lines.join('\n');
}

/** Plain text a tester sends as is: what broke, where, on which build. No answers, no tokens. */
export function formatCrashReport(input: CrashReportInput): string {
  const { error, componentStack, screen, build, at } = input;
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? trimStack(error.stack) : null;

  const lines = [
    'VoxOrd crash report',
    `Build: ${formatBuildLabel(build)}${build.buildType ? ` ${build.buildType}` : ''}`,
    `Device: ${Platform.OS} ${String(Platform.Version)}`,
    `Screen: ${screen}`,
    `Time: ${at.toISOString()}`,
    '',
    `${name}: ${message}`,
  ];
  if (stack) lines.push('', 'Stack:', stack);
  if (componentStack) lines.push('', 'Components:', trimStack(componentStack));
  return lines.join('\n');
}
