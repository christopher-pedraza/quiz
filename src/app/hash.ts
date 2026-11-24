import { useCallback, useSyncExternalStore } from 'react'

export type Route =
  | { view: 'practice'; qid?: string }
  | { view: 'exam' }
  | { view: 'run' }
  | { view: 'result' }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'exam') return parts[1] === 'run' ? { view: 'run' } : parts[1] === 'result' ? { view: 'result' } : { view: 'exam' }
  if (parts[0] === 'practice' && parts[1]) {
    try {
      return { view: 'practice', qid: decodeURIComponent(parts[1]) }
    } catch {
      /* fall through */
    }
  }
  return { view: 'practice' }
}

export const routeHash = (r: Route): string =>
  r.view === 'practice' ? (r.qid ? `#/practice/${encodeURIComponent(r.qid)}` : '#/practice') : r.view === 'exam' ? '#/exam' : r.view === 'run' ? '#/exam/run' : '#/exam/result'

const EVENT = 'quiz-route'
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('hashchange', cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** The current route, and a navigate(route, replace?) that either pushes a history entry or rewrites the current one. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const navigate = useCallback((r: Route, replace = false) => {
    const h = routeHash(r)
    if (replace) {
      history.replaceState(null, '', h)
      window.dispatchEvent(new Event(EVENT))
    } else window.location.hash = h
  }, [])
  return [parseRoute(hash), navigate]
}
