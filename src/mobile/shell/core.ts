// Shell state shared by every mobile screen: window size class, the one open sheet, snackbars, the keyboard, and the
// Android back stack (top sheet -> dialog -> screen; never exits with unsaved work without asking).
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

// ---------------------------------------------------------------- size classes
export type SizeClass = 'compact' | 'medium' | 'expanded'
export const sizeClassOf = (w: number): SizeClass => (w >= 840 ? 'expanded' : w >= 600 ? 'medium' : 'compact')

export function useSizeClass(): SizeClass {
  const [c, setC] = useState<SizeClass>(() => sizeClassOf(window.innerWidth))
  useEffect(() => {
    const on = () => setC(sizeClassOf(window.innerWidth))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return c
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine)
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false)
    window.addEventListener('online', u); window.addEventListener('offline', d)
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', d) }
  }, [])
  return on
}

// ---------------------------------------------------------------- back stack
type Layer = { close: () => void; kind: 'sheet' | 'dialog' | 'screen' | 'menu' }
const layers: Layer[] = []

/** Closes the top layer (menu, then sheet, then dialog, then screen). False when nothing is open. */
export function handleBack(): boolean {
  const top = layers.pop()
  if (!top) return false
  top.close()
  return true
}
export const backDepth = () => layers.length

/** While `active`, the Android back gesture calls `close` before anything below it. */
export function useBackLayer(active: boolean, close: () => void, kind: Layer['kind'] = 'sheet'): void {
  const ref = useRef(close)
  useEffect(() => { ref.current = close })
  useEffect(() => {
    if (!active) return
    const layer: Layer = { close: () => ref.current(), kind }
    layers.push(layer)
    return () => { const i = layers.lastIndexOf(layer); if (i >= 0) layers.splice(i, 1) }
  }, [active, kind])
}

// ---------------------------------------------------------------- ui store: one sheet at a time, snackbars, confirm
export interface Snack { id: number; text: string; action?: { label: string; run: () => void }; tone?: 'info' | 'error' | 'success'; ms?: number }
export interface ConfirmReq { title: string; body?: string; confirm: string; cancel?: string; danger?: boolean; resolve: (ok: boolean) => void }

interface UiState {
  sheet: string | null
  openSheet: (id: string) => void
  closeSheet: (id?: string) => void
  snacks: Snack[]
  confirm: ConfirmReq | null
}
let snackSeq = 0
export const useUi = create<UiState>((set, get) => ({
  sheet: null,
  // opening a sheet closes whichever one was open: never two sheets at once
  openSheet: (id) => set({ sheet: id }),
  closeSheet: (id) => { if (!id || get().sheet === id) set({ sheet: null }) },
  snacks: [],
  confirm: null,
}))

export function snack(text: string, opts: Omit<Snack, 'id' | 'text'> = {}): void {
  const s: Snack = { id: ++snackSeq, text, ...opts }
  useUi.setState((st) => ({ snacks: [...st.snacks.slice(-2), s] }))
  setTimeout(() => dismissSnack(s.id), s.ms ?? (s.action ? 6000 : 3500))
}
export function dismissSnack(id: number) { useUi.setState((st) => ({ snacks: st.snacks.filter((x) => x.id !== id) })) }

/** An in-app confirmation (never a browser dialog, which would block the WebView). */
export function confirmAsk(req: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useUi.setState({ confirm: { ...req, resolve } }))
}

// ---------------------------------------------------------------- keyboard
/** Keeps --m-kb (keyboard height) and html.kb-open current, and scrolls the focused field into view. */
export function watchKeyboard(): () => void {
  const root = document.documentElement
  const set = (h: number) => {
    root.style.setProperty('--m-kb', `${Math.max(0, Math.round(h))}px`)
    root.classList.toggle('kb-open', h > 0)
    if (h > 0) setTimeout(() => {
      const el = document.activeElement as HTMLElement | null
      if (el && el !== document.body) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }
  const subs: Array<() => void> = []
  if (Capacitor.isNativePlatform()) {
    const show = Keyboard.addListener('keyboardWillShow', (i) => set(i.keyboardHeight))
    const hide = Keyboard.addListener('keyboardWillHide', () => set(0))
    subs.push(() => { void show.then((h) => h.remove()); void hide.then((h) => h.remove()) })
  } else if (window.visualViewport) {
    const vv = window.visualViewport
    const on = () => set(window.innerHeight - vv.height - vv.offsetTop)
    vv.addEventListener('resize', on)
    subs.push(() => vv.removeEventListener('resize', on))
  }
  return () => { subs.forEach((f) => f()); set(0) }
}

// ---------------------------------------------------------------- unsaved work
const guards = new Set<() => string | null>()
/** Register a check that returns a reason when leaving now would lose work (null = nothing at risk). */
export function useUnsavedGuard(check: () => string | null): void {
  const ref = useRef(check)
  useEffect(() => { ref.current = check })
  useEffect(() => {
    const fn = () => ref.current()
    guards.add(fn)
    return () => { guards.delete(fn) }
  }, [])
}
export function unsavedReason(): string | null {
  for (const g of guards) { const r = g(); if (r) return r }
  return null
}
