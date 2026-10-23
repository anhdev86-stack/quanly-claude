import type { SwitcherApi } from './index'

declare global {
  interface Window {
    switcher: SwitcherApi
  }
}

export {}
