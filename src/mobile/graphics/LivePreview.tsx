// A big live copy of the banner in the empty space ABOVE the open sheet, so a change (weight, colour, size ...) is seen the
// moment it is made without closing the sheet. It reads the Stage's own canvas (already redrawn for every change) and
// repaints on every store change; nothing is rendered twice and nothing is stored. The sheet is held to about half the
// screen while it is open (see .gx-needs-preview), and the preview steps aside when the sheet is dragged to full height.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../pc/store'

export function LivePreview() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const paint = () => {
      raf = 0
      const src = document.querySelector<HTMLCanvasElement>('.gx-canvas canvas.stage-canvas')
      const dst = ref.current
      if (!src || !dst || !src.width) return
      const h = 1000, w = Math.round((src.width / src.height) * h)
      if (dst.width !== w || dst.height !== h) { dst.width = w; dst.height = h }
      const c = dst.getContext('2d')
      if (c) { c.clearRect(0, 0, w, h); c.drawImage(src, 0, 0, w, h) }
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => requestAnimationFrame(paint)) } // after the Stage has redrawn
    queue()
    const off = useStore.subscribe(queue)
    return () => { off(); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return (
    <>
      <span className="gx-needs-preview" aria-hidden />
      {createPortal(
        <div className="gx-live-top" aria-label="Live preview of the banner">
          <canvas ref={ref} />
          <span className="gx-live-tag"><i aria-hidden />Live preview</span>
        </div>,
        document.body,
      )}
    </>
  )
}
