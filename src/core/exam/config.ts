import type { Question } from '../model/types.ts'
import { QUESTION_TYPES } from '../model/types.ts'
import type { ExamPreset } from '../share/preset.ts'
import type { ExamConfig } from './sample.ts'

/** The exam builder's form state. Selections are explicit sets; "all" is represented by every id being present. */
export interface BuilderState {
  count: number
  /** 0 = untimed. */
  minutes: number
  topics: string[]
  types: string[]
  difficulties: string[]
  /** Percent per topic; absent = "auto" (shares the remainder). */
  weights: Record<string, number>
  shuffle: boolean
  /** Include the seed in share links so everyone gets exactly the same questions and numbers. */
  lockSeed: boolean
}

const DIFFICULTIES = ['easy', 'medium', 'hard']

export function defaultBuilderState(questions: readonly Question[], topicIds: readonly string[], defaults?: { count?: number; minutes?: number }): BuilderState {
  const present = new Set(questions.map((q) => q.type))
  return {
    count: Math.min(defaults?.count ?? 20, Math.max(1, questions.length)),
    minutes: defaults?.minutes ?? 0,
    topics: [...topicIds],
    types: QUESTION_TYPES.map((t) => t.type).filter((t) => present.has(t)),
    difficulties: DIFFICULTIES,
    weights: {},
    shuffle: true,
    lockSeed: false,
  }
}

/** Preset → form state. A missing filter in the preset means "everything". */
export function stateFromPreset(preset: ExamPreset, base: BuilderState): BuilderState {
  // A preset naming nothing that exists in this quiz selects everything rather than an empty exam.
  const pick = (wanted: readonly string[] | undefined, universe: string[]) => {
    const hit = wanted?.length ? universe.filter((u) => wanted.includes(u)) : universe
    return hit.length ? hit : universe
  }
  return {
    ...base,
    count: preset.count,
    minutes: preset.minutes ?? 0,
    topics: pick(preset.topics, base.topics),
    types: pick(preset.types, base.types),
    difficulties: preset.difficulties?.length ? preset.difficulties : base.difficulties,
    weights: Object.fromEntries(Object.entries(preset.weights ?? {}).filter(([t]) => base.topics.includes(t))),
    shuffle: preset.shuffle !== false,
    lockSeed: preset.seed !== undefined,
  }
}

/** Form state → exam config. Filters that select everything are left out. */
export function configFromState(s: BuilderState, all: { topics: readonly string[]; types: readonly string[] }, seed: number): ExamConfig {
  const subset = (picked: readonly string[], universe: readonly string[]) => (universe.every((u) => picked.includes(u)) ? undefined : picked.filter((p) => universe.includes(p)))
  const weights = Object.fromEntries(Object.entries(s.weights).filter(([t, w]) => s.topics.includes(t) && Number.isFinite(w) && w >= 0))
  return {
    count: s.count,
    ...(s.minutes > 0 && { minutes: s.minutes }),
    topics: subset(s.topics, all.topics),
    types: subset(s.types, all.types) as ExamConfig['types'],
    difficulties: subset(s.difficulties, DIFFICULTIES) as ExamConfig['difficulties'],
    ...(Object.keys(weights).length > 0 && { weights }),
    shuffle: s.shuffle,
    seed,
  }
}

/** A shareable preset: the config without the seed unless the author locked it. */
export function presetFromConfig(c: ExamConfig, lockSeed: boolean): ExamPreset {
  const { seed, ...rest } = c
  return { ...(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Omit<ExamPreset, 'seed'>), ...(lockSeed && { seed }) }
}
