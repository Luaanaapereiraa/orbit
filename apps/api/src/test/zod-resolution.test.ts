import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('zod resolution for API and contracts', () => {
  it('resolves Zod 3.25.76 from the API workspace', () => {
    const pkg = require('zod/package.json') as { version: string }
    expect(pkg.version).toBe('3.25.76')
    expect(pkg.version.startsWith('3.')).toBe(true)
  })
})
