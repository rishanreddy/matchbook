import { LIMITS, QUESTION_TYPES, SURVEYJS_LATEST_SCHEMA_URL, SURVEYJS_LOGIC_URL, SURVEYJS_SCHEMA_URL, SURVEYJS_VERSION } from './formRules'

export type PromptContext = {
  season?: number | null
  eventName?: string | null
  currentForm?: Record<string, unknown> | null
  extraNotes?: string
}

/** This example is tested with the same engine and checker that run the finished form. */
export const EXAMPLE_FORM: Record<string, unknown> = {
  title: 'Match scouting',
  clearInvisibleValues: 'onHidden',
  calculatedValues: [{ name: 'piecesTotal', expression: 'sum({autoScored}, {teleopScored})', includeIntoResult: true }],
  pages: [
    {
      name: 'autonomous', title: 'Autonomous',
      elements: [
        { type: 'boolean', name: 'autoLeftStartingZone', title: 'Did the robot leave the starting zone?' },
        { type: 'text', name: 'autoScored', title: 'Game pieces scored in auto', inputType: 'number', min: 0, max: 20, defaultValue: 0 },
      ],
    },
    {
      name: 'teleop', title: 'Teleop',
      elements: [
        { type: 'text', name: 'teleopScored', title: 'Game pieces scored in teleop', inputType: 'number', min: 0, max: 60, defaultValue: 0 },
        { type: 'rating', name: 'driverSkill', title: 'How well was it driven?', rateMin: 1, rateMax: 5, minRateDescription: 'Struggled', maxRateDescription: 'Excellent' },
        { type: 'radiogroup', name: 'defenseLevel', title: 'How much defense did it play?', choices: ['None', 'Some', 'Mostly'] },
      ],
    },
    {
      name: 'endgame', title: 'Endgame and notes',
      elements: [
        { type: 'boolean', name: 'attemptedClimb', title: 'Did the robot attempt a climb?' },
        { type: 'boolean', name: 'endgameClimbed', title: 'Did that climb succeed?', visibleIf: '{attemptedClimb} = true', requiredIf: '{attemptedClimb} = true' },
        { type: 'text', name: 'foulsCommitted', title: 'Fouls committed', inputType: 'number', min: 0, max: 20, defaultValue: 0 },
        { type: 'comment', name: 'notes', title: 'Anything else worth remembering?', rows: 3 },
      ],
    },
  ],
}

const FENCE = String.fromCharCode(96).repeat(3)
function jsonBlock(value: unknown): string {
  return [FENCE + 'json', JSON.stringify(value, null, 2), FENCE].join('\n')
}

/** A portable brief for an external AI assistant; Matchbook does not contact an AI service. */
export function buildAiFormPrompt(context: PromptContext = {}): string {
  const about: string[] = []
  const event = context.eventName?.trim()
  if (context.season) about.push('My team is scouting the ' + context.season + ' FIRST Robotics Competition season' + (event ? ', at ' + event : '') + '.')
  else if (event) about.push('My team is scouting ' + event + '.')
  if (context.extraNotes?.trim()) about.push('Things my team wants you to know: ' + context.extraNotes.trim())
  if (context.currentForm) {
    about.push(
      'My team already has this form in Matchbook. Start from it: ask what to keep or change. Keep existing question names and result keys for unchanged metrics so old and new observations remain comparable.',
      jsonBlock(context.currentForm),
    )
  }
  if (about.length === 0) about.push('I have not told Matchbook which season or event this is, so ask me first.')

  return [
    'You are helping a FIRST Robotics Competition (FRC) team design a match-scouting form for Matchbook, an offline scouting app. Interview me, design the questions and SurveyJS logic, then write the finished form as JSON to paste into Matchbook.',

    [
      'HOW WE WILL WORK',
      '1. Start by asking me about the game. Ask one or two short questions at a time. If the season is newer than your knowledge, investigate official game documentation or ask me for its scoring summary; do not invent game rules.',
      '2. Ask what we need for comparing teams and choosing alliance partners: autonomous scoring, teleop throughput, endgame, reliability, defense and driver skill. A scout follows one robot for about 2.5 minutes. Prefer easy counters, clear choices and short questions.',
      '3. Propose the questions grouped by page, explain useful conditional logic and which metrics we will compare, and revise with me. Aim for 15–25 questions across 3–4 pages; prefer at most ' + LIMITS.comfortableQuestions + ' questions. Use the features that help this form, rather than adding every feature.',
      '4. Only after I approve the design, give one short sentence then the complete JSON in a single ' + FENCE + 'json code block. Nothing else belongs inside the code block. Use double quotes, no comments and no trailing commas.',
    ].join('\n'),

    [
      'SURVEYJS REFERENCE — INVESTIGATE BEFORE WRITING THE FINAL JSON',
      'Matchbook bundles SurveyJS ' + SURVEYJS_VERSION + '. Use its native JSON features, not a smaller invented subset.',
      'Schema for the bundled version: ' + SURVEYJS_SCHEMA_URL,
      'Latest schema reference requested by our team: ' + SURVEYJS_LATEST_SCHEMA_URL,
      'Official expression and conditional-logic documentation: ' + SURVEYJS_LOGIC_URL,
      'If you can browse, read the versioned schema and relevant official examples. The latest schema may describe features newer than our bundled version; use the bundled version as the compatibility contract. If you cannot access a reference, say so and use only properties you can verify; do not pretend you read it.',
      'The app checks JSON properties and expressions with its real SurveyJS engine before accepting your form. Unknown settings and functions must be fixed, not silently ignored.',
    ].join('\n'),

    [
      'WHAT THE FORM LOOKS LIKE',
      'The top level contains "title" and "pages". Pages contain "name", "title" and "elements". Give questions stable "name" IDs and concise human-readable "title" wording.',
      'This small example demonstrates conditional questions, validation bounds and a saved derived metric. It is a structural example, not a definition of any season’s game:',
      jsonBlock(EXAMPLE_FORM),
      'In this example piecesTotal is neutral, so the same scoring actions are not added twice. A hidden climb-success answer is cleared when the scout changes attemptedClimb to No. Its Yes percentage describes observed attempts; hidden/unanswered questions are excluded, not treated as No.',
    ].join('\n'),

    [
      'HOW MATCHBOOK SAVES AND ANALYZES ANSWERS',
      '- Matchbook saves SurveyJS model.data, including native nested answers, expression-question results and calculatedValues with "includeIntoResult": true. Calculated values without that flag are available to logic but are not saved for Analysis.',
      '- Analysis starts with the current event and lets us rank teams, select 2–4 teams to compare, inspect match trends and review original entries. Every top-level numeric or boolean answer can be an individual metric without a phase prefix. Numeric metrics support average, sum, minimum and maximum; boolean metrics show Yes percentage using answered booleans as the denominator. Unanswered values are excluded, not replaced with zero.',
      '- Numeric strings are supported. Negative and decimal values are useful as individual numeric metrics. Text, arrays and objects remain in entries, but are not automatically numeric rankings. For a matrix, multiple-text, checkbox, ranking, dynamic panel or dynamic matrix, expose a meaningful top-level scalar aggregate using a native expression question or a saved calculated value.',
      '- Prefix-based phase totals are a separate shortcut: Matchbook uses the START of its name in the saved top-level result object, case-insensitively. "auto" contributes to autonomous, "teleop" to teleop, and "endgame" or "climb" to endgame. Each finite non-negative numeric answer or numeric string is rounded to an integer, then summed; true contributes 1 and false 0. Negative values, text, objects, arrays and unanswered values do not contribute.',
      '- Those phase totals count the activities chosen by our form. They do not automatically apply official game point values. Prefer specific named individual metrics for partner selection. If we want official points, encode verified season-specific weights in calculations and explain exactly what is counted.',
      '- Prevent double-counting: choose ONE approach for each phase. Either prefix raw scoring answers and keep derived totals neutral (autoScored + teleopScored with neutral piecesTotal), OR give raw inputs neutral names and save a prefixed calculated phase total. Never prefix both a total and the inputs it already sums.',
      '- Penalties, misses, failures, defense ratings and opinions should normally have neutral names such as foulsCommitted, droppedPieces, brokeDown or driverSkill. A positive counter named teleopFouls would incorrectly raise teleop totals. Numeric dropdown/radio choice VALUES do count; word labels count only if their stored value is numeric.',
      '- IDs should use camelCase, letters/numbers/underscores starting with a letter. Static-panel children still save at the top level. Dynamic-template children save under their parent array/object; repeated child names in separate templates are valid. Keep top-level IDs and calculated-value names distinct. SurveyJS "valueName" changes the saved result key: analysis and phase prefixes use that key, not the display name.',
      '- Do not ask for the match number or the team number. Matchbook supplies hidden "_matchNumber" and "_teamNumber" as strings; expressions may reference them. Other underscore names are private to the app. Do not define or overwrite this context.',
      '- Finish with a top-level "comment" question whose result key is "notes". Matchbook also copies that string into match notes for team review.',
    ].join('\n'),

    [
      'NATIVE QUESTIONS AND LOGIC TOOLKIT',
      'Available native question types: ' + QUESTION_TYPES.map((type) => '"' + type + '"').join(', ') + '. Static "panel" groups are also supported.',
      '- Use "boolean", number-input "text", "rating", "slider" and choice questions for fast observations. Choose sensible ranges and numeric/expression validators. Use explicit numeric choice values with readable text if a choice must become a numeric metric. Avoid defaulting an unobserved result to No; only use zero defaults for counters whose zero is a real observation.',
      '- Use visibleIf, enableIf and requiredIf to hide irrelevant detail, prevent impossible combinations and require an answer only when it applies. Use clearInvisibleValues/clearIfInvisible deliberately so changing an earlier answer does not leave stale hidden data. Check what a conditional metric’s denominator means.',
      '- Native defaultValueExpression, setValueExpression, resetValueIf, calculatedValues, expression questions and expression validators are available. Use SurveyJS syntax such as {questionName}, comparisons, logical operators and built-in functions; expressions are not JavaScript. Matchbook does not register custom JavaScript functions.',
      '- Built-in functions include iif, sum, avg, min, max, round and array aggregates such as sumInArray and countInArray. For example sumInArray({cycles}, \'pieces\') can feed a saved top-level metric from a dynamic panel. Follow official syntax for {panel.child}, {row.column}, {item} and {choice} in their documented scopes.',
      '- Local choices, choicesFromQuestion, choice filtering, conditional pages/panels, matrix questions, dynamic panels/matrices, multiple-text inputs, ranking, embedded images, file questions and signatures are available when they serve a clear need. Preserve their complete native JSON; do not flatten away valid logic.',
      '- Rich-text instructions can use paragraphs, emphasis, headings, lists and tables. Matchbook sanitizes rendered HTML. No scripts, event handlers, inline CSS, links or embedded web content. For images, use native questions with embedded PNG/JPEG/GIF/WebP data URIs.',
      '- The final form runs offline. Do not use choicesByUrl, external media, completion redirects, custom widgets, JavaScript callbacks or features requiring server handlers. File/signature questions must keep storeDataAsText enabled. Large embedded files also increase QR transfer time, so use them sparingly.',
      '- Stay below ' + LIMITS.maxPages + ' pages, ' + LIMITS.maxQuestions + ' question definitions and ' + LIMITS.maxBytes + ' UTF-8 JSON bytes. Prefer far fewer questions for real scouting.',
    ].join('\n'),

    [
      'REVIEW BEFORE RETURNING JSON',
      'Check every referenced name, page branch, validator, calculation and choice value. Check what happens when an answer is missing or an earlier answer changes. Keep all data needed for our Analysis in saved top-level scalar fields. Explain which metrics help pick alliance partners and call out deliberate phase-total choices. I can try the actual questions and logic in Matchbook’s interactive preview before saving.',
    ].join('\n'),
    ['ABOUT MY TEAM', ...about].join('\n'),
    'Begin now: ask me your first question about the game.',
  ].join('\n\n')
}
