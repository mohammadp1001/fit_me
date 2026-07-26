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
          muscles:
            primary: [pec_major_sternal]
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
          muscles:
            primary: [quadriceps]
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
          muscles:
            primary: [lats]
          sets: 3
          reps: 10
          superset_with: "Ex B"
        - name: "Ex B"
          muscles:
            primary: [lats]
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
          muscles:
            primary: [lats]
          sets: 3
          reps: 10
    `;
    expect(() => parseWorkoutYaml(yaml)).toThrow();
  });

  it('parses optional video and guide fields', () => {
    const yaml = `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Ex"
          muscles:
            primary: [lats]
          sets: 3
          reps: 10
          video: "https://example.com/ex.mp4"
          description: "شرح"
          description_en: "Description"
          tips: ["نکته"]
          tips_en: ["Tip one", "Tip two"]
          mistakes: ["اشتباه"]
          mistakes_en: ["A mistake"]
    `;
    const ex = parseWorkoutYaml(yaml).days[0].exercises[0];
    expect(ex.video).toBe('https://example.com/ex.mp4');
    expect(ex.description_en).toBe('Description');
    expect(ex.tips_en).toEqual(['Tip one', 'Tip two']);
    expect(ex.mistakes).toEqual(['اشتباه']);
  });

  it('leaves guide fields undefined when omitted', () => {
    const yaml = `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Ex"
          muscles:
            primary: [lats]
          sets: 3
          reps: 10
    `;
    const ex = parseWorkoutYaml(yaml).days[0].exercises[0];
    expect(ex.video).toBeUndefined();
    expect(ex.tips).toBeUndefined();
    expect(ex.mistakes_en).toBeUndefined();
  });

  it('defaults name_en when missing', () => {
    const yaml = `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Ex"
          muscles:
            primary: [lats]
          sets: 3
          reps: 10
    `;
    const result = parseWorkoutYaml(yaml);
    expect(result.name_en).toBeUndefined();
  });
});

describe('parseWorkoutYaml — muscles', () => {
  const wrap = (musclesBlock: string) => `
program:
  name: "Test"
  days:
    - name: "Day 1"
      exercises:
        - name: "Lat Pulldown"
${musclesBlock}
          sets: 3
          reps: 10
  `;

  it('parses primary and secondary into separate lists', () => {
    const ex = parseWorkoutYaml(
      wrap(`          muscles:
            primary: [lats, rhomboids]
            secondary: [biceps_brachii]`)
    ).days[0].exercises[0];

    expect(ex.musclesPrimary).toEqual(['lats', 'rhomboids']);
    expect(ex.musclesSecondary).toEqual(['biceps_brachii']);
  });

  it('defaults secondary to an empty list', () => {
    const ex = parseWorkoutYaml(
      wrap(`          muscles:
            primary: [lats]`)
    ).days[0].exercises[0];

    expect(ex.musclesSecondary).toEqual([]);
  });

  it('rejects the legacy flat free-text list', () => {
    expect(() =>
      parseWorkoutYaml(wrap('          muscles: ["Chest", "Triceps"]'))
    ).toThrow(/"muscles" is now an object, not a list/);
  });

  it('rejects an unknown muscle and names the exercise', () => {
    expect(() =>
      parseWorkoutYaml(
        wrap(`          muscles:
            primary: [latisimus]`)
      )
    ).toThrow(/exercise "Lat Pulldown": unknown muscle "latisimus"/);
  });

  it('suggests the nearest canonical key for a near miss', () => {
    expect(() =>
      parseWorkoutYaml(
        wrap(`          muscles:
            primary: [latts]`)
      )
    ).toThrow(/did you mean "lats"\?/);
  });

  it('rejects an empty primary list', () => {
    expect(() =>
      parseWorkoutYaml(
        wrap(`          muscles:
            primary: []
            secondary: [lats]`)
      )
    ).toThrow(/muscles\.primary must list at least one muscle/);
  });

  it('rejects a muscle listed as both primary and secondary', () => {
    expect(() =>
      parseWorkoutYaml(
        wrap(`          muscles:
            primary: [lats]
            secondary: [lats]`)
      )
    ).toThrow(/listed as both primary and secondary/);
  });

  it('rejects a missing muscles block', () => {
    expect(() => parseWorkoutYaml(wrap('          video: "x.mp4"'))).toThrow(
      /missing "muscles"/
    );
  });
});
