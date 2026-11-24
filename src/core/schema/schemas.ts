// Single source of truth for the quiz file formats. `npm run schemas` emits these to public/schema/*.json
// (so authors can add "$schema" for editor autocomplete) and the app validates with the very same objects.

type S = Record<string, unknown>

const str: S = { type: 'string' }
const text: S = { type: 'string', minLength: 1 }
const md = (description: string): S => ({ type: 'string', minLength: 1, description })
const idStr: S = { type: 'string', pattern: '^[A-Za-z0-9_.:-]+$', minLength: 1, maxLength: 120 }
const strs = (min = 0): S => ({ type: 'array', minItems: min, items: text })
const bool: S = { type: 'boolean' }
const posInt: S = { type: 'integer', minimum: 1 }
const num: S = { type: 'number' }
const ref = (name: string): S => ({ $ref: `#/$defs/${name}` })
const obj = (properties: S, required: string[] = []): S => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const distractor: S = {
  anyOf: [text, obj({ text, why: str }, ['text'])],
  description: 'a string, or {"text": "...", "why": "why it is wrong"}',
}

const defs: S = {
  distractor,
  blank: obj(
    {
      id: idStr,
      answers: { ...strs(1), description: 'every accepted answer' },
      patterns: { ...strs(), description: 'regular expressions (anchored) that are also accepted' },
      label: str,
      placeholder: str,
      multiline: bool,
      caseSensitive: bool,
      mode: { enum: ['text', 'choice'] },
      options: { ...strs(2), description: 'choice mode: a fixed list of options (must include every answer you want shown)' },
      distractors: { type: 'array', items: ref('distractor'), description: 'choice mode: wrong options sampled per showing' },
      show: { type: 'integer', minimum: 2, description: 'choice mode with distractors: number of options shown' },
    },
    ['id', 'answers'],
  ),
  codeError: obj(
    {
      line: { type: 'integer', minimum: 1, description: '1-based line number in `code`' },
      fixes: { ...strs(1), description: 'every accepted replacement for the line' },
      options: { ...strs(2), description: 'if present the learner picks the fix from these instead of typing it' },
      explanation: str,
    },
    ['line', 'fixes'],
  ),
  choiceOption: obj({ text, correct: bool, explanation: str }, ['text', 'correct']),
  tolerance: {
    anyOf: [
      { type: 'number', minimum: 0 },
      obj({ abs: { type: 'number', minimum: 0 }, rel: { type: 'number', minimum: 0 } }),
    ],
    description: 'a number (absolute) or {"abs": n, "rel": fraction}',
  },
  calcPart: obj(
    {
      id: idStr,
      label: str,
      value: num,
      formula: text,
      tolerance: ref('tolerance'),
      unit: str,
    },
    ['id'],
  ),
  variable: {
    anyOf: [
      obj({ choices: { type: 'array', minItems: 1, items: num } }, ['choices']),
      obj({ min: num, max: num, step: { type: 'number', exclusiveMinimum: 0 } }, ['min', 'max']),
      obj({ formula: text }, ['formula']),
    ],
    description: '{"choices": [..]}, {"min": a, "max": b, "step": s} or {"formula": "..."}',
  },
}

const common: S = {
  id: idStr,
  topic: idStr,
  title: str,
  difficulty: { enum: ['easy', 'medium', 'hard'] },
  tags: strs(),
  hints: strs(),
  explanation: md('Markdown shown after answering'),
  points: { type: 'number', exclusiveMinimum: 0 },
  reference: strs(),
}

function member(type: string, props: S, required: string[]): S {
  return {
    type: 'object',
    properties: { type: { const: type }, ...common, ...props },
    required: ['type', 'id', 'topic', ...required],
    additionalProperties: false,
  }
}
const prompt = md('Markdown (with $math$) shown above the answer area')

const members: S[] = [
  member(
    'fill-blank',
    {
      prompt,
      template: { type: 'string', minLength: 1, description: 'text containing <<BLANK:id>> markers' },
      language: { type: 'string', description: 'if set, the template is code' },
      mode: { enum: ['text', 'choice', 'drag'] },
      blanks: { type: 'array', minItems: 1, items: ref('blank') },
      distractors: { type: 'array', items: ref('distractor'), description: 'drag mode: extra chips that fit no blank' },
    },
    ['template', 'blanks'],
  ),
  member(
    'code-debug',
    { prompt, language: str, code: text, errors: { type: 'array', minItems: 1, items: ref('codeError') } },
    ['prompt', 'code', 'errors'],
  ),
  member(
    'mcq',
    { prompt, options: { type: 'array', minItems: 2, items: ref('choiceOption') }, shuffle: bool },
    ['prompt', 'options'],
  ),
  member(
    'multi-select',
    {
      prompt,
      options: { type: 'array', minItems: 2, items: ref('choiceOption') },
      grading: { enum: ['all-or-nothing', 'partial'] },
      shuffle: bool,
    },
    ['prompt', 'options'],
  ),
  member(
    'calculation',
    {
      prompt,
      code: str,
      language: str,
      parts: { type: 'array', minItems: 1, items: ref('calcPart') },
      variables: { type: 'object', additionalProperties: ref('variable') },
      constraints: strs(),
    },
    ['prompt', 'parts'],
  ),
  member(
    'ordering',
    {
      prompt,
      items: { ...strs(2), description: 'in the CORRECT order; shuffled when shown' },
      language: str,
      grading: { enum: ['exact', 'partial'] },
    },
    ['prompt', 'items'],
  ),
  member(
    'matching',
    {
      prompt,
      pairs: { type: 'array', minItems: 2, items: obj({ left: text, right: text }, ['left', 'right']) },
      distractors: strs(),
      grading: { enum: ['all-or-nothing', 'partial'] },
    },
    ['prompt', 'pairs'],
  ),
  member(
    'categorize',
    {
      prompt,
      categories: {
        type: 'array',
        minItems: 2,
        items: obj({ id: idStr, title: text, items: strs(1) }, ['id', 'title', 'items']),
      },
      distractors: strs(),
      distractorPenalty: { type: 'number', minimum: 0, maximum: 1 },
    },
    ['prompt', 'categories'],
  ),
  member(
    'short-answer',
    {
      prompt,
      modelAnswer: md('Markdown shown after the learner has answered'),
      rubric: {
        type: 'array',
        minItems: 1,
        items: obj({ text, points: { type: 'number', exclusiveMinimum: 0 } }, ['text']),
      },
    },
    ['prompt', 'modelAnswer', 'rubric'],
  ),
]

export const QUESTION_TYPE_NAMES = members.map((m) => ((m.properties as S).type as { const: string }).const)

/** Validates ONE question. The batch files are arrays/JSONL of these. */
export const questionSchema: S = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'question.schema.json',
  title: 'Quiz question',
  type: 'object',
  $defs: defs,
  discriminator: { propertyName: 'type' },
  oneOf: members,
}

const theme = (strict: boolean): S => ({
  type: 'object',
  properties: {
    scheme: { enum: ['dark', 'light'] },
    accent: { type: 'string', description: 'hex, rgb(), hsl() or oklch()' },
    accentSecondary: { type: 'string' },
    bgPrimary: { type: 'string' },
    bgSurface: { type: 'string' },
    fontSans: { type: 'string', description: 'CSS font-family list' },
    fontMono: { type: 'string' },
    radius: { type: 'string', pattern: '^\\d+(\\.\\d+)?(px|rem|em)$' },
  },
  additionalProperties: !strict,
})

export const themeSchema: S = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'theme.schema.json',
  title: 'Quiz theme',
  ...theme(true),
}

export const manifestSchema: S = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'manifest.schema.json',
  title: 'Quiz manifest',
  type: 'object',
  properties: {
    $schema: str,
    schemaVersion: { const: 1 },
    title: text,
    description: text,
    author: str,
    version: str,
    topics: {
      type: 'array',
      minItems: 1,
      items: {
        anyOf: [idStr, obj({ id: idStr, title: text, description: str }, ['id', 'title'])],
        description: 'a topic id, or {"id": "...", "title": "..."}',
      },
    },
    questions: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', pattern: '\\.(json|jsonl)$', description: 'path to a .json (array) or .jsonl file' },
    },
    reference: { type: 'string', pattern: '\\.(md|json)$' },
    theme: { anyOf: [{ type: 'string', pattern: '\\.json$' }, theme(false)], description: 'path to a theme .json, or an inline theme object' },
    exam: obj({ count: posInt, minutes: posInt }),
  },
  required: ['title', 'description', 'topics', 'questions'],
  additionalProperties: false,
}

export const referenceSchema: S = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'reference.schema.json',
  title: 'Quiz reference sheet',
  type: 'object',
  properties: {
    $schema: str,
    version: str,
    entries: {
      type: 'array',
      items: obj(
        {
          name: text,
          aliases: strs(),
          kind: str,
          module: str,
          signature: str,
          summary: text,
          parameters: {
            type: 'array',
            items: obj({ name: text, type: str, default: str, description: str }, ['name', 'description']),
          },
          returns: str,
          example: str,
          notes: strs(),
          see_also: strs(),
          tags: strs(),
        },
        ['name', 'summary'],
      ),
    },
  },
  required: ['entries'],
  additionalProperties: false,
}

export const emittedSchemas: Record<string, S> = {
  'manifest.schema.json': manifestSchema,
  'question.schema.json': questionSchema,
  'theme.schema.json': themeSchema,
  'reference.schema.json': referenceSchema,
}
