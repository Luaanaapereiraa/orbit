import { afterEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY, STORAGE_KEY_DESTRAVAI } from './storage'
import { resolveThemeFromStorage, THEME_BOOTSTRAP } from './theme-bootstrap'

function memoryStore(entries: Record<string, string | null>) {
  return (key: string) => entries[key] ?? null
}

describe('resolveThemeFromStorage', () => {
  it('prefers a valid DestravAI envelope over v2', () => {
    expect(
      resolveThemeFromStorage(
        memoryStore({
          [STORAGE_KEY_DESTRAVAI]: JSON.stringify({
            version: 1,
            state: { settings: { theme: 'light' } },
          }),
          [STORAGE_KEY]: JSON.stringify({ settings: { theme: 'dark' } }),
        }),
      ),
    ).toBe('light')
  })

  it('falls back to v2 when the new key is corrupted', () => {
    expect(
      resolveThemeFromStorage(
        memoryStore({
          [STORAGE_KEY_DESTRAVAI]: '{not-json',
          [STORAGE_KEY]: JSON.stringify({ settings: { theme: 'light' } }),
        }),
      ),
    ).toBe('light')
  })

  it('uses a safe dark fallback when the new envelope has no theme', () => {
    expect(
      resolveThemeFromStorage(
        memoryStore({
          [STORAGE_KEY_DESTRAVAI]: JSON.stringify({
            version: 1,
            state: { settings: {} },
          }),
          [STORAGE_KEY]: JSON.stringify({ settings: { theme: 'light' } }),
        }),
      ),
    ).toBe('dark')
  })

  it('defaults to dark when nothing is stored', () => {
    expect(resolveThemeFromStorage(memoryStore({}))).toBe('dark')
  })
})

describe('THEME_BOOTSTRAP', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('embeds both storage keys', () => {
    expect(THEME_BOOTSTRAP).toContain(STORAGE_KEY_DESTRAVAI)
    expect(THEME_BOOTSTRAP).toContain(STORAGE_KEY)
  })

  it('applies the dark class before hydration', () => {
    localStorage.setItem(
      STORAGE_KEY_DESTRAVAI,
      JSON.stringify({
        version: 1,
        state: { settings: { theme: 'dark' } },
      }),
    )

    document.documentElement.classList.remove('dark')
    // eslint-disable-next-line no-new-func
    new Function(THEME_BOOTSTRAP)()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class for a stored light theme', () => {
    localStorage.setItem(
      STORAGE_KEY_DESTRAVAI,
      JSON.stringify({
        version: 1,
        state: { settings: { theme: 'light' } },
      }),
    )

    document.documentElement.classList.add('dark')
    // eslint-disable-next-line no-new-func
    new Function(THEME_BOOTSTRAP)()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
