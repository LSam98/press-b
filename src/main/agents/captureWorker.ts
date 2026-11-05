import { parentPort } from 'worker_threads'
import { CaptureWriter } from './capture'
import { Exchange } from './proxy'

// The capture worker: parsing, classifying and saving happen here, on their own
// thread, so a large request never pauses the proxy's forwarding.

const writers = new Map<string, CaptureWriter>()

// Buffers arrive as plain Uint8Arrays after crossing the thread boundary.
const buf = (u: Uint8Array): Buffer => Buffer.from(u.buffer, u.byteOffset, u.byteLength)

parentPort?.on('message', (msg: { type: string; dir: string; root: string; x: Exchange }) => {
  if (msg?.type !== 'exchange') return
  try {
    let w = writers.get(msg.dir)
    if (!w) {
      w = new CaptureWriter(msg.dir, msg.root)
      writers.set(msg.dir, w)
    }
    const x: Exchange = {
      ...msg.x,
      body: buf(msg.x.body),
      chunks: msg.x.chunks.map((c) => ({ t: c.t, data: buf(c.data) }))
    }
    parentPort?.postMessage({ type: 'summary', root: msg.root, summary: w.write(x) })
  } catch (e) {
    parentPort?.postMessage({ type: 'error', message: String((e as Error)?.stack || e) })
  }
})
