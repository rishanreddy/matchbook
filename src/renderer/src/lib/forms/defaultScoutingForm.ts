/**
 * A starting scouting form that works for any FRC season.
 *
 * Game-specific scoring changes every year, so this asks about things every game has:
 * did the robot move in auto, how much did it score, what did it do at the end, and
 * how did it handle. A team should be able to use this as-is at their first event and
 * edit it once they know what their own strategy cares about.
 *
 * Naming matters here. Matchbook sorts an answer into a phase by the start of its
 * name (`auto`, `teleop`, `endgame`/`climb`), and every scored answer adds to that
 * phase. So anything that reflects badly on a robot, like dropped pieces or a
 * breakdown, deliberately has no phase prefix. Naming a penalty `teleopFouls` would
 * make a sloppy robot look better than a clean one.
 */

export const DEFAULT_SCOUTING_FORM: Record<string, unknown> = {
  title: 'Match scouting',
  description: 'One robot, one match. Fill this in as the match happens.',
  showQuestionNumbers: 'off',
  widthMode: 'responsive',
  pages: [
    {
      name: 'autonomous',
      title: 'Autonomous',
      description: 'The first seconds, before drivers take over.',
      elements: [
        {
          type: 'boolean',
          name: 'autoMoved',
          title: 'Did the robot move during auto?',
          defaultValue: false,
        },
        {
          type: 'text',
          name: 'autoScored',
          title: 'Game pieces scored in auto',
          inputType: 'number',
          min: 0,
          max: 50,
          defaultValue: 0,
        },
        {
          type: 'boolean',
          name: 'autoReachedScoringArea',
          title: 'Did it reach the scoring area in auto?',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'teleop',
      title: 'Teleop',
      description: 'The main driver-controlled period.',
      elements: [
        {
          type: 'text',
          name: 'teleopScored',
          title: 'Game pieces scored in teleop',
          inputType: 'number',
          min: 0,
          max: 200,
          defaultValue: 0,
        },
        {
          type: 'text',
          name: 'teleopCycles',
          title: 'Completed cycles',
          description: 'A full trip from pickup to scoring. Leave at 0 if you are not counting cycles.',
          inputType: 'number',
          min: 0,
          max: 100,
          defaultValue: 0,
        },
        {
          type: 'rating',
          name: 'driverSkill',
          title: 'How well was it driven?',
          description: 'Not scored. Used for comparing teams by hand.',
          rateCount: 5,
          rateMin: 1,
          rateMax: 5,
          minRateDescription: 'Struggled',
          maxRateDescription: 'Excellent',
        },
      ],
    },
    {
      name: 'endgame',
      title: 'Endgame',
      description: 'The last stretch of the match.',
      elements: [
        {
          type: 'boolean',
          name: 'endgameClimbed',
          title: 'Did the robot climb or hang?',
          defaultValue: false,
        },
        {
          type: 'boolean',
          name: 'endgameParked',
          title: 'Did it park in the endgame zone?',
          defaultValue: false,
        },
        {
          type: 'text',
          name: 'endgameScored',
          title: 'Game pieces scored in the endgame',
          inputType: 'number',
          min: 0,
          max: 50,
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'issues',
      title: 'Problems and notes',
      description: 'Nothing on this page counts toward a score.',
      elements: [
        {
          type: 'boolean',
          name: 'playedDefense',
          title: 'Did it play defense?',
          defaultValue: false,
        },
        {
          type: 'boolean',
          name: 'brokeDown',
          title: 'Did it stop working during the match?',
          defaultValue: false,
        },
        {
          type: 'boolean',
          name: 'tipped',
          title: 'Did it tip over?',
          defaultValue: false,
        },
        {
          type: 'text',
          name: 'droppedPieces',
          title: 'Game pieces dropped',
          inputType: 'number',
          min: 0,
          max: 100,
          defaultValue: 0,
        },
        {
          type: 'comment',
          name: 'notes',
          title: 'Anything else worth remembering',
          description: 'What you would tell your drive team about this robot.',
          rows: 3,
        },
      ],
    },
  ],
}
