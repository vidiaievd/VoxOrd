import { formatCrashReport, getCurrentScreen, setCurrentScreen } from './crashReport';

const BUILD = { version: '0.0.1', build: '412', commit: 'a1b2c3d', buildType: 'release' };
const AT = new Date('2026-11-22T10:00:00.000Z');

describe('formatCrashReport', () => {
  it('names the build, screen, time and error', () => {
    const error = new TypeError('x is undefined');
    error.stack = 'TypeError: x is undefined\n    at Body (Body.tsx:10)';
    const report = formatCrashReport({
      error,
      componentStack: '\n    in Body\n    in Runner',
      screen: 'ExerciseRunner',
      build: BUILD,
      at: AT,
    });
    expect(report).toContain('Build: 0.0.1 (412 · a1b2c3d) release');
    expect(report).toContain('Screen: ExerciseRunner');
    expect(report).toContain('Time: 2026-11-22T10:00:00.000Z');
    expect(report).toContain('TypeError: x is undefined');
    expect(report).toContain('at Body (Body.tsx:10)');
    expect(report).toContain('in Runner');
  });

  it('takes a thrown non-Error as the message', () => {
    const report = formatCrashReport({ error: 'boom', screen: 'Today', build: BUILD, at: AT });
    expect(report).toContain('Error: boom');
    expect(report).not.toContain('Stack:');
  });

  it('keeps the top of a long stack', () => {
    const error = new Error('deep');
    error.stack = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const report = formatCrashReport({ error, screen: 'Today', build: BUILD, at: AT });
    expect(report).toContain('line 24');
    expect(report).not.toContain('line 25');
    expect(report).toContain('… 15 more');
  });
});

describe('current screen', () => {
  it('remembers the last screen set', () => {
    setCurrentScreen('CourseHome');
    expect(getCurrentScreen()).toBe('CourseHome');
  });
});
