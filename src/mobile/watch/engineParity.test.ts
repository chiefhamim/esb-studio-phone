// The news engine is one engine in two apps: these files must equal the PC's src/news (tools/sync-pc.mjs news).
// Without the PC checkout, they must still equal the hashes recorded at the last sync (nobody edited them here).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const HERE = path.resolve(__dirname)
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'ENGINE_MANIFEST.json'), 'utf8')) as { files: Record<string, string> }
const textSha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
const PC_NEWS = [process.env.ESB_PC_REPO, 'C:/Users/hamim/esb-studio-pc', path.resolve(HERE, '../../../../esb-studio-pc')]
  .filter((p): p is string => !!p)
  .map((p) => path.join(p, 'src', 'news'))
  .find((p) => fs.existsSync(p))

describe('shared news engine', () => {
  it.each(Object.keys(manifest.files))('%s is unedited since the last sync', (f) => {
    expect(textSha(path.join(HERE, f))).toBe(manifest.files[f])
  })
  it.runIf(!!PC_NEWS).each(Object.keys(manifest.files))('%s equals the PC copy', (f) => {
    expect(textSha(path.join(HERE, f))).toBe(textSha(path.join(PC_NEWS!, f)))
  })
})
