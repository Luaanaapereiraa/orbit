import { STORAGE_KEY } from './storage'

export const THEME_BOOTSTRAP = `try{var raw=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});var theme=raw?JSON.parse(raw).settings.theme:'dark';document.documentElement.classList.toggle('dark',theme!=='light')}catch(e){}`
