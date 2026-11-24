import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// RTL only auto-cleans when vitest globals are on; do it explicitly (a no-op for node-environment tests).
afterEach(() => cleanup())
