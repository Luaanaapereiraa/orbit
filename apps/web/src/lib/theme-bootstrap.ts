import { STORAGE_KEY, STORAGE_KEY_DESTRAVAI } from './storage'

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTheme(value: unknown): 'light' | 'dark' | null {
  return value === 'light' || value === 'dark' ? value : null
}

export function resolveThemeFromStorage(
  getItem: (key: string) => string | null,
): 'light' | 'dark' {
  const destravaiRaw = getItem(STORAGE_KEY_DESTRAVAI)

  if (destravaiRaw) {
    const parsed = parseJson(destravaiRaw)

    if (isRecord(parsed) && parsed.version === 1) {
      const state = isRecord(parsed.state) ? parsed.state : {}
      const settings = isRecord(state.settings) ? state.settings : {}

      return readTheme(settings.theme) ?? 'dark'
    }
  }

  const v2Raw = getItem(STORAGE_KEY)

  if (v2Raw) {
    const parsed = parseJson(v2Raw)

    if (isRecord(parsed)) {
      const settings = isRecord(parsed.settings) ? parsed.settings : {}

      return readTheme(settings.theme) ?? 'dark'
    }
  }

  return 'dark'
}

export const THEME_BOOTSTRAP = `try{var k1=${JSON.stringify(
  STORAGE_KEY_DESTRAVAI,
)};var k2=${JSON.stringify(
  STORAGE_KEY,
)};var t;function rec(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}function themeOf(v){return v==='light'||v==='dark'?v:null}var d=localStorage.getItem(k1);if(d){try{var p=JSON.parse(d);if(rec(p)&&p.version===1){var st=rec(p.state)?p.state:{};var s=rec(st.settings)?st.settings:{};t=themeOf(s.theme)||'dark'}}catch(e){}}if(!t){var v2=localStorage.getItem(k2);if(v2){try{var p2=JSON.parse(v2);if(rec(p2)){var s2=rec(p2.settings)?p2.settings:{};t=themeOf(s2.theme)||'dark'}}catch(e){}}}document.documentElement.classList.toggle('dark',(t||'dark')!=='light')}catch(e){}`
