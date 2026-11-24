// Pure conversion of the legacy (neural-networks-pa-practice) question format to the quiz platform format.
// The CLI wrapper is convert-legacy.ts.

type Obj = Record<string, unknown>

export interface ConvertContext {
  /** Language of code snippets (the legacy course is all Python). */
  language: string
  /** category → topic id; shared across calls so ids stay stable. */
  topicIds: Map<string, string>
}

export interface Converted {
  question?: Obj
  /** Fields that were dropped or conversions worth a human's attention. */
  notes: string[]
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topic'
}

export function topicFor(category: string, ctx: ConvertContext): string {
  let id = ctx.topicIds.get(category)
  if (id) return id
  const taken = new Set(ctx.topicIds.values())
  const base = slugify(category)
  id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  ctx.topicIds.set(category, id)
  return id
}

const omitUndefined = (o: Obj): Obj => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

function mapDistractor(d: unknown): unknown {
  return d
}

export function convertQuestion(q: Obj, ctx: ConvertContext): Converted {
  const notes: string[] = []
  const id = String(q.id)
  const type = String(q.type)
  const common = {
    id,
    topic: topicFor(String(q.category ?? 'General'), ctx),
    title: q.title,
    difficulty: q.difficulty,
    tags: q.tags,
    hints: q.hints,
    explanation: q.explanation,
    reference: q.related_reference,
  }
  if (q.source) notes.push('dropped "source"')
  if (q.slides) notes.push('dropped "slides"')
  const done = (body: Obj): Converted => ({ question: omitUndefined({ ...common, ...body }), notes })

  switch (type) {
    case 'fill_blank':
      return done({
        type: 'fill-blank',
        prompt: q.description,
        language: ctx.language,
        template: q.code,
        blanks: (q.blanks as Obj[]).map((b) => omitUndefined({ id: b.id, answers: b.answers, patterns: b.accepted_patterns, placeholder: b.placeholder, multiline: b.multiline })),
      })
    case 'find_fix':
      return done({ type: 'code-debug', prompt: q.description, language: ctx.language, code: q.code, errors: q.errors })
    case 'code_choice': {
      const slotExplanations: string[] = []
      const blanks = (q.slots as Obj[]).map((s) => {
        if (s.explanation) slotExplanations.push(String(s.explanation))
        return omitUndefined({ id: s.id, label: s.label, answers: s.answers, distractors: (s.distractors as unknown[]).map(mapDistractor), show: s.show })
      })
      const explanation = q.explanation ?? (slotExplanations.length ? slotExplanations.join('\n\n') : undefined)
      const r = done({
        type: 'fill-blank',
        mode: 'choice',
        prompt: q.description,
        language: ctx.language,
        template: String(q.code).replace(/<<SLOT:/g, '<<BLANK:'),
        blanks,
      })
      if (r.question && explanation !== undefined) r.question.explanation = explanation
      return r
    }
    case 'multiple_choice': {
      const options = q.options as Obj[]
      const correct = options.filter((o) => o.correct).length
      const multi = q.selection === 'multiple' || correct > 1
      if (q.selection === 'single' && correct > 1) notes.push('marked "single" but has several correct options: converted to multi-select')
      return done({
        type: multi ? 'multi-select' : 'mcq',
        prompt: q.prompt,
        code: undefined,
        options: options.map((o) => omitUndefined({ text: o.text, correct: o.correct, explanation: o.explanation })),
        ...(q.code ? { _code: q.code } : {}),
      })
    }
    case 'calculation':
    case 'param_count':
    case 'generated_calc':
      return done({
        type: 'calculation',
        prompt: q.prompt,
        code: q.code,
        language: q.code ? ctx.language : undefined,
        variables: q.variables,
        constraints: q.constraints,
        parts: (q.parts as Obj[]).map((p) => omitUndefined({ id: p.id, label: p.label, value: p.value, formula: p.formula, tolerance: p.tolerance, unit: p.unit })),
      })
    case 'open_ended':
      return done({
        type: 'short-answer',
        prompt: q.prompt,
        modelAnswer: q.model_answer,
        rubric: (q.key_points as string[]).map((text) => ({ text })),
      })
    default:
      return { notes: [`unknown legacy type "${type}"`] }
  }
}

/** Legacy multiple-choice questions may carry supporting `code`; the new mcq has none, so it moves into the prompt. */
export function inlineCode(q: Obj, language: string): Obj {
  if (typeof q._code !== 'string') return q
  const { _code, ...rest } = q
  return { ...rest, prompt: `${String(rest.prompt ?? '')}\n\n\`\`\`${language}\n${_code}\n\`\`\`` }
}

