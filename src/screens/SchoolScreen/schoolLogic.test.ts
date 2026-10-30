import { classLabel, schoolCourses } from './schoolLogic';

describe('schoolCourses', () => {
  it('puts the main course first, once, and skips untitled', () => {
    expect(
      schoolCourses({
        groupId: 'g',
        groupName: 'G',
        teachers: [],
        mainCourse: { courseId: 'a', courseName: 'A' },
        materials: [
          { courseId: 'a', courseName: 'A' },
          { courseId: 'b', courseName: null },
          { courseId: 'c', courseName: 'C' },
        ],
      }),
    ).toEqual([
      { courseId: 'a', title: 'A' },
      { courseId: 'c', title: 'C' },
    ]);
  });
});

describe('classLabel', () => {
  it('trims seconds and keeps the room', () => {
    const l = classLabel(
      { date: '2026-10-12', startTime: '18:00:00', endTime: '19:30:00', room: ' B2 ' },
      'en',
    );
    expect(l.when.endsWith('18:00–19:30')).toBe(true);
    expect(l.room).toBe('B2');
  });
  it('has no room when blank', () => {
    expect(
      classLabel({ date: '2026-10-12', startTime: '18:00', endTime: '19:00', room: '' }, 'en').room,
    ).toBeNull();
  });
});
