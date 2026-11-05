// One command to ship an update over the internet: node tools/release.mjs [--apk] [--message "text"]
//  1. builds the web app and zips dist/ as the OTA bundle (version = package version + a build stamp, always increasing)
//  2. optionally (--apk) builds, signs and includes the full APK for native changes
//  3. writes public/latest.json with the sha256 of each file, and deploys update-host/ to Cloudflare (workers static assets)
// Needs `npx wrangler login` once. No GitHub, no Capgo.
import { execFileSync, execSync } from 'node:child_process'
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import JSZip from 'jszip'

const root = process.cwd()
const args = process.argv.slice(2)
const withApk = args.includes('--apk')
const mi = args.indexOf('--message')
const message = mi >= 0 ? args[mi + 1] : undefined
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const d = new Date()
const p2 = (n) => String(n).padStart(2, '0')
const stamp = `${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`
const version = `${pkg.version}.${stamp}`
const pub = join(root, 'update-host', 'public')
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
// Every file is signed with the release key, kept only on this PC (never in the repo, never on Cloudflare). The app
// refuses an update whose signature does not verify against the public key in src/platform/ota.ts. Back this file up.
const keyPath = process.env.ESB_OTA_KEY || join(homedir(), '.esb-ota', 'ed25519-private.pem')
if (!existsSync(keyPath)) throw new Error(`No release signing key at ${keyPath}. Without it phones refuse the update.`)
const signKey = createPrivateKey(readFileSync(keyPath))
const signed = (file) => ({ ...file, sig: sign(null, Buffer.from(`esb-ota-v1\n${version}\n${file.file}\n${file.sha256}`), signKey).toString('base64') })

console.log('> build'); execSync('npm run build', { stdio: 'inherit' })
rmSync(pub, { recursive: true, force: true }); mkdirSync(pub, { recursive: true })

const zip = new JSZip()
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else zip.file(relative('dist', p).replaceAll(String.fromCharCode(92), '/'), readFileSync(p)) } }
walk('dist')
const bundle = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
const bundleName = `bundle-${version}.zip`
writeFileSync(join(pub, bundleName), bundle)

const manifest = { version, bundle: signed({ file: bundleName, sha256: sha(bundle) }), message, releasedAt: d.toISOString() }
// --native marks this release as needing the new APK (new permission / plugin): older installs get the APK, not the bundle
if (args.includes('--native')) manifest.minNative = pkg.version
if (withApk) {
  const apk = join(root, 'android/app/build/outputs/apk/release/ESB-Studio-' + pkg.version + '.apk')
  if (!existsSync(apk)) throw new Error('Build and sign the APK first (see docs/RELEASE.md), then re-run with --apk.')
  const buf = readFileSync(apk); const name = `ESB-Studio-${version}.apk`
  copyFileSync(apk, join(pub, name)); manifest.apk = signed({ file: name, sha256: sha(buf) })
}
writeFileSync(join(pub, 'latest.json'), JSON.stringify(manifest, null, 2))
copyFileSync(join(root, 'update-host/public-headers.txt'), join(pub, '_headers'))

console.log('> deploy'); execFileSync('npx', ['wrangler', 'deploy'], { cwd: join(root, 'update-host'), stdio: 'inherit', shell: true })
console.log(`\nReleased ${version}. Phones pick it up the next time the app is opened.`)
