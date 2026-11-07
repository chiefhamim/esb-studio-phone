// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { backDepth, handleBack, sizeClassOf, unsavedReason, useBackLayer, useUi, useUnsavedGuard, snack, dismissSnack } from './core'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Layer({ on, close, kind }: { on: boolean; close: () => void; kind: 'sheet' | 'dialog' | 'screen' }) { useBackLayer(on, close, kind); return null }
function Guard({ why }: { why: string | null }) { useUnsavedGuard(() => why); return null }

describe('size classes', () => {
  it('follow the Material breakpoints', () => {
    expect([360, 599, 600, 839, 840, 1280].map(sizeClassOf)).toEqual(['compact', 'compact', 'medium', 'medium', 'expanded', 'expanded'])
  })
})

describe('Android back', () => {
  it('closes the newest layer first: sheet, then dialog, then screen', () => {
    const log: string[] = []
    const el = document.createElement('div')
    const root = createRoot(el)
    act(() => root.render(<><Layer on kind="screen" close={() => log.push('screen')} /><Layer on kind="dialog" close={() => log.push('dialog')} /><Layer on kind="sheet" close={() => log.push('sheet')} /></>))
    expect(backDepth()).toBe(3)
    handleBack(); handleBack(); handleBack()
    expect(log).toEqual(['sheet', 'dialog', 'screen'])
    expect(handleBack()).toBe(false)
    act(() => root.unmount())
  })
  it('asks before leaving while work is at risk', () => {
    const el = document.createElement('div')
    const root = createRoot(el)
    act(() => root.render(<Guard why="Publishing is still running." />))
    expect(unsavedReason()).toBe('Publishing is still running.')
    act(() => root.render(<Guard why={null} />))
    expect(unsavedReason()).toBeNull()
    act(() => root.unmount())
  })
})

describe('sheets', () => {
  it('only one is open at a time', () => {
    useUi.getState().openSheet('photos')
    useUi.getState().openSheet('layers')
    expect(useUi.getState().sheet).toBe('layers')
    useUi.getState().closeSheet('photos')
    expect(useUi.getState().sheet).toBe('layers')
    useUi.getState().closeSheet()
    expect(useUi.getState().sheet).toBeNull()
  })
})

describe('snacks', () => {
  it('auto-closes in 3 seconds by default', () => {
    vi.useFakeTimers()
    useUi.setState({ snacks: [] })
    snack('Saved to device')
    expect(useUi.getState().snacks.length).toBe(1)
    expect(useUi.getState().snacks[0].text).toBe('Saved to device')

    // Advance 2900ms: still there
    act(() => { vi.advanceTimersByTime(2900) })
    expect(useUi.getState().snacks.length).toBe(1)

    // Advance past 3000ms: auto-closed
    act(() => { vi.advanceTimersByTime(200) })
    expect(useUi.getState().snacks.length).toBe(0)
    vi.useRealTimers()
  })

  it('can be dismissed early before auto-close time', () => {
    vi.useFakeTimers()
    useUi.setState({ snacks: [] })
    snack('Quick dismiss')
    expect(useUi.getState().snacks.length).toBe(1)
    const id = useUi.getState().snacks[0].id

    // Dismiss early
    act(() => { dismissSnack(id) })
    expect(useUi.getState().snacks.length).toBe(0)

    // Advancing timers does not crash or re-dismiss
    act(() => { vi.advanceTimersByTime(3000) })
    expect(useUi.getState().snacks.length).toBe(0)
    vi.useRealTimers()
  })
})
