// Copies MediaPipe's WebAssembly files into public/ so they're served by our own origin,
// pinned to the exact version in package.json.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const to = join(root, 'public', 'mediapipe', 'wasm')

mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log('Copied MediaPipe wasm to public/mediapipe/wasm')
