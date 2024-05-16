import { fromBytes } from '@/base64url/mod.ts'
import { DeferredWithTimeout, toPromise } from '@/deferred/mod.ts'
import { type ID, type Message, type Reply } from '@/opfs/types.ts'

const isSupported = 'storage' in self.navigator && 'getDirectory' in self.navigator.storage
const refs: Map<number, (reply: Reply) => void> = new Map()
const memory: Map<string, File> = new Map()
let currentRef = 0
let worker: Worker | undefined = undefined

export function isOPFSSupported(): boolean {
  return isSupported
}

function createWorker(): Worker {
  if (worker) { return worker }

  worker = new Worker(new URL('/lib/opfs/worker.ts', import.meta.url), { type: 'module' })

  worker.addEventListener('message', e => {
    if (typeof e.data.type !== 'string') { return }

    const data = e.data as Message

    if (data.type === 'reply') {
      const cb = refs.get(data.ref)

      if (cb) {
        cb(data.payload)
      }
    }
  })

  return worker
}

function nextRef(): number {
  return currentRef++
}

export async function getAttachmentFile(
  itemId: Uint8Array,
  attachmentId: Uint8Array,
  fileName: string
): Promise<File | undefined> {
  const path = pathFrom([itemId, attachmentId])

  if (!isSupported) {
    return memory.get(path)
  }

  const parts = path.split('/')
  const root = await navigator.storage.getDirectory()

  try {
    let dir = root

    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: false })
    }

    const fileHandle = await dir.getFileHandle(fileName, { create: false })
    return await fileHandle.getFile()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      console.warn('could not find file in opfs', path, fileName)
      return undefined
    }

    throw e
  }
}

export function putAttachmentFile(
  itemId: Uint8Array,
  attachmentId: Uint8Array,
  file: File
): Promise<void> {
  const path = pathFrom([itemId, attachmentId])

  if (!isSupported) {
    memory.set(path, file as File)
    return Promise.resolve()
  }

  const def = new DeferredWithTimeout<void, Error>(5000, new Error('writing a file timed out'))
  const ref = nextRef()

  refs.set(ref, reply => {
    console.assert(reply.type === 'putFile', 'expected the reply to be of type putFileReply')

    if (reply.type === 'putFile') {
      if (reply.ok) {
        def.resolve()
      } else {
        def.reject(new Error(`putting attachment file failed: ${reply.error}`))
      }
    }
  })

  def.finally(() => {
    refs.delete(ref)
  })

  const msg: Message = {
    type: 'putFile',
    ref,
    path,
    file
  }

  const w = createWorker()
  w.postMessage(msg)

  return toPromise(def)
}

function pathFrom(ids: ID[]): string {
  return ids.map(id => {
    if (id instanceof Uint8Array) {
      return fromBytes(id)
    } else {
      return id
    }
  }).join('/')
}
