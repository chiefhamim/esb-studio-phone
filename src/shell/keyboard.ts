// While the on-screen keyboard is open the editor needs the screen: the app sets `kb-open` on <html> and the shell hides its
// bars (top bar, status line, bottom nav) in CSS. Native: @capacitor/keyboard events. Browser: focus on a text field.
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]), textarea, [contenteditable=true]'
const set = (on: boolean) => document.documentElement.classList.toggle('kb-open', on)

/** Returns a cleanup function. */
export function watchKeyboard(): () => void {
  const subs: Array<() => void> = []
  if (Capacitor.isNativePlatform()) {
    const show = Keyboard.addListener('keyboardWillShow', () => set(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => set(false))
    subs.push(() => { void show.then((h) => h.remove()); void hide.then((h) => h.remove()) })
  } else {
    const onIn = (e: FocusEvent) => { if ((e.target as Element | null)?.matches?.(EDITABLE)) set(true) }
    const onOut = () => window.setTimeout(() => { if (!document.activeElement?.matches?.(EDITABLE)) set(false) }, 80)
    document.addEventListener('focusin', onIn); document.addEventListener('focusout', onOut)
    subs.push(() => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) })
  }
  return () => { subs.forEach((f) => f()); set(false) }
}
