import { parseWorkoutYaml } from './yaml-parser';

describe('parseWorkoutYaml', () => {
  it('parses a valid program with fixed reps', () => {
    const yaml = `
program:
  name: "Test Program"
  name_en: "Test Program EN"
  days:
    - name: "Day 1"
      name_en: "Day 1 EN"
      exercises:
        - name: "Exercise A"
          muscles: ["Chest"]
          sets: 3
          reps: 10
    `;
    const result = parseWorkoutYaml(yaml);
    expect(result.name).toBe('Test Program');
    expect(result.name_en).toBe('Test Program EN');
    expect(result.days).toHaveLength(1);
    expect(result.days[0].exercises).toHaveLength(1);
    expect(result.days[0].exercises[0].reps).toEqual([10]);
  });

  it('parses reps as an array', () => {
    const yaml = `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Exercise"
          sets: 4
          reps: [12, 10, 8, 6]
    `;
    const result = parseWorkoutYaml(yaml);
    expect(result.days[0].exercises[0].reps).toEqual([12, 10, 8, 6]);
  });

  it('parses superset links', () => {
    const yaml = `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Ex A"
          sets: 3
          reps: 10
          superset_with: "Ex B"
        - name: "Ex B"
          sets: 3
          reps: 10
          superset_with: "Ex A"
    `;
    const result = parseWorkoutYaml(yaml);
    expect(result.days[0].exercises[0].superset_with).toBe('Ex B');
    expect(result.days[0].exercises[1].superset_with).toBe('Ex A');
  });

  it('throws on invalid YAML structure', () => {
    const yaml = `
program:
  days:
    - name: "Day 1"
      exercises:
        - name: "Ex"
          sets: invalid
    `;
    expect(() => parseWorkoutYaml(yaml)).toThrow();
  });

  it('throws on missing required fields', () => {
    const yaml = `
program:
  days:
    - exercises:
        - name: "Ex"
          sets: 3
          reps: 10
    `;
    expect(() => parseWorkoutYaml(yaml)).toThrow();
  });

  it('defaults name_en when missing', () => {
    const yaml = `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Ex"
          sets: 3
          reps: 10
    `;
    const result = parseWorkoutYaml(yaml);
    expect(result.name_en).toBeUndefined();
  });
});
