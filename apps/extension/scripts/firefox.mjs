#!/usr/bin/env node
/**
 * Firefox packaging for Gloss AI.
 *
 *   node scripts/firefox.mjs manifest   dist/ → dist-firefox/ with a Firefox manifest
 *   node scripts/firefox.mjs check-api  refuses a production package that points at localhost
 *   node scripts/firefox.mjs source     zips the extension's source for AMO review
 *
 * The code is the same for both browsers; only the manifest differs. Chrome's
 * side panel becomes Firefox's sidebar, the service worker becomes an event
 * page, and Chrome-only keys are dropped.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = `${root}dist`
const out = `${root}dist-firefox`
const artifacts = `${root}web-ext-artifacts`

/** Permanent on addons.mozilla.org: never change it after the first upload. */
const GECKO_ID = 'gloss-ai@yobernu.dev'

/**
 * Firefox 140 is the ESR baseline: it has the CSS Custom Highlight API used to
 * paint highlights, and the built-in data-collection consent declared below.
 */
const MIN_FIREFOX = '140.0'

/**
 * What the add-on collects, shown to the user by Firefox at install
 * (see PRIVACY.md). Account email and password; the address and text of the
 * page open in the sidebar.
 */
const DATA_COLLECTION = {
  required: ['personallyIdentifyingInfo', 'authenticationInfo', 'browsingActivity', 'websiteContent'],
}

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function firefoxManifest(chrome) {
  const {
    key: _key, // pins the Chrome extension ID; meaningless to Firefox
    minimum_chrome_version: _minimumChrome,
    side_panel: sidePanel,
    background: _background,
    permissions = [],
    ...rest
  } = chrome

  return {
    manifest_version: rest.manifest_version,
    name: rest.name,
    short_name: rest.short_name,
    version: rest.version,
    description: rest.description,
    icons: rest.icons,
    permissions: permissions.filter((permission) => permission !== 'sidePanel'),
    host_permissions: rest.host_permissions,
    // Firefox runs MV3 background code as an event page, not a service worker.
    background: { scripts: ['background.js'], type: 'module' },
    action: rest.action,
    sidebar_action: {
      default_panel: sidePanel?.default_path ?? 'sidepanel.html',
      default_title: rest.name,
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
      open_at_install: false,
    },
    commands: {
      _execute_sidebar_action: {
        suggested_key: { default: 'Alt+Shift+G' },
        description: 'Open Gloss AI',
      },
    },
    content_scripts: rest.content_scripts,
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: MIN_FIREFOX,
        data_collection_permissions: DATA_COLLECTION,
      },
    },
  }
}

function buildManifest() {
  if (!existsSync(`${dist}/manifest.json`)) fail('dist/ is missing; run `pnpm build` first.')

  rmSync(out, { recursive: true, force: true })
  cpSync(dist, out, { recursive: true })

  const chrome = JSON.parse(readFileSync(`${dist}/manifest.json`, 'utf8'))
  writeFileSync(`${out}/manifest.json`, `${JSON.stringify(firefoxManifest(chrome), null, 2)}\n`)
  console.log(`✔ dist-firefox/ ready (${GECKO_ID}, Firefox ${MIN_FIREFOX}+)`)
}

/** The API URL Vite baked into this production build. */
function checkApi() {
  const env = loadEnv('production', root, 'VITE_')
  const url = env.VITE_API_BASE_URL ?? 'http://localhost:3000'
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    fail(`VITE_API_BASE_URL is not a URL: ${url}`)
  }

  if (parsed.protocol !== 'https:' || /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) {
    fail(
      `This build talks to ${url}. A published add-on needs the hosted API over HTTPS: ` +
        'set VITE_API_BASE_URL in .env.production (or the environment) and rebuild.',
    )
  }
  console.log(`✔ API: ${url}`)
}

/**
 * AMO requires the original source for bundled or minified code, with build
 * steps a reviewer can follow. This archives the extension directory at HEAD.
 */
function sourceArchive() {
  const status = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8' })
  if (status.trim()) {
    console.warn('⚠ Uncommitted changes are not in the source archive; commit first so it matches the build.')
  }

  const { version } = JSON.parse(readFileSync(`${root}public/manifest.json`, 'utf8'))
  mkdirSync(artifacts, { recursive: true })
  const file = `${artifacts}/gloss_ai-${version}-source.zip`
  execFileSync('git', ['archive', '--format=zip', `--output=${file}`, '--prefix=gloss-ai-extension/', 'HEAD:apps/extension'], {
    cwd: root,
  })
  console.log(`✔ ${file.replace(root, '')}`)
}

const command = process.argv[2]
if (command === 'manifest') buildManifest()
else if (command === 'check-api') checkApi()
else if (command === 'source') sourceArchive()
else fail('Usage: node scripts/firefox.mjs <manifest|check-api|source>')
