// The phone's handle on the PC story editor (RichBodyEditor.tsx, TipTap). RichBodyEditor does not hand out its editor,
// so the phone reads the one TipTap itself puts on the editor element (`.ProseMirror`.editor, set by @tiptap/core when
// the view is created) and drives it with the same commands the PC toolbar uses. Pictures go through the same steps as
// the PC's (prepareImage -> the site's upload -> an https URL in the story); a draft never holds a picture from the phone.
// Requested in the report: an `onEditor` prop on RichBodyEditor so this lookup is not needed.
import { useEffect, useReducer, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { prepareImage, altFromName } from '../../pc/editorial/imageTools'
import { uploadBodyImage } from '../../pc/editorial/siteConnect'
import { useEditorialStore } from '../../pc/editorial/editorialStore'

let current: Editor | null = null
export const bodyEditor = () => (current && !current.isDestroyed ? current : null)

/** Find the TipTap editor inside `host` once it exists, and keep it current. */
export function useHostedEditor(host: HTMLElement | null): Editor | null {
  const [ed, setEd] = useState<Editor | null>(null)
  useEffect(() => {
    if (!host) return
    const look = () => {
      const el = host.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null
      const found = el?.editor && !el.editor.isDestroyed ? el.editor : null
      setEd((prev) => (prev === found ? prev : found))
    }
    look()
    const mo = new MutationObserver(look)
    mo.observe(host, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [host])
  useEffect(() => { current = ed; return () => { if (current === ed) current = null } }, [ed])
  return ed
}

/** Re-render on every editor transaction (marks, selection, undo depth all change there). */
export function useEditorTick(ed: Editor | null): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!ed) return
    ed.on('transaction', bump)
    ed.on('selectionUpdate', bump)
    return () => { ed.off('transaction', bump); ed.off('selectionUpdate', bump) }
  }, [ed])
}

export type Upload = { ok: true; url: string } | { ok: false; error: string }

/** Upload one picture for the story body as the signed-in editor (Planned until the site's phone upload route is live). */
export async function uploadForStory(blob: Blob): Promise<Upload> {
  const { staffSession, draft } = useEditorialStore.getState()
  const r = await uploadBodyImage(staffSession, blob, draft.slug || draft.headline)
  return r.ok ? r : { ok: false, error: r.error }
}

/** A picture file from the phone: scaled and encoded like the PC, uploaded, then placed at the cursor. */
export async function insertPictureFile(ed: Editor, file: File, onStep: (s: string) => void): Promise<Upload> {
  onStep('Preparing the picture…')
  const blob = await prepareImage(file)
  onStep('Uploading to esbpowerline.com…')
  const up = await uploadForStory(blob)
  if (up.ok) ed.chain().focus().insertContent({ type: 'image', attrs: { src: up.url, alt: altFromName(file.name), caption: '', credit: '', align: 'default' } }).run()
  return up
}

export function insertPictureUrl(ed: Editor, url: string) {
  ed.chain().focus().insertContent({ type: 'image', attrs: { src: url.trim(), alt: '', caption: '', credit: '', align: 'default' } }).run()
}
