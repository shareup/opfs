import { chunkBlob } from '@/chunks/mod.ts'
import { type Message, type Reply } from '@/opfs/types.ts'
import { uniqueStringFor } from '@/unique-string-for/mod.ts'

const isSupported = 'storage' in self.navigator && 'getDirectory' in self.navigator.storage

addEventListener('message', e => {
  if (typeof e.data.type !== 'string') { return }

  const data = e.data as Message

  switch (data.type) {
    case 'putFile': {
      putFile(data.path, data.file)
        .then(
          () => {
            reply(data.ref, { type: data.type, ok: true })
          },
          e => {
            console.error('there wan an error putting a file', data, e.name, e.message, e)
            reply(data.ref, {
              type: data.type,
              ok: false,
              error: uniqueStringFor(e) + ` ${e.name} ${e.message}`
            })
          }
        )

      break
    }
  }
})

function reply(
  ref: number,
  payload: Reply
) {
  const message: Message = {
    type: 'reply',
    ref,
    payload
  }

  postMessage(message)
}

async function putFile(path: string, file: File | FileSystemFileHandle): Promise<void> {
  if (!isSupported) {
    throw new Error('origin private file system is not supported in this user agent')
  }

  const root = await navigator.storage.getDirectory()
  const parts = path.split('/')

  let dir = root

  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true })
  }

  const fileHandle = await dir.getFileHandle(file.name, { create: true })

  // SEE: https://github.com/WICG/file-system-access/blob/main/AccessHandle.md#appendix
  // @ts-ignore we know createSyncAccessHandle() exists in the worker context
  const accessHandle = await fileHandle.createSyncAccessHandle()

  try {
    let cursor = 0

    let realFile: File

    if (file instanceof File) {
      realFile = file
    } else {
      realFile = await file.getFile()
    }

    // FIXME: do we need to stream this or can we just write the File and be done with it?
    const [_numberOfChunks, iterable] = chunkBlob(realFile, 1024 * 1024)

    for await (const chunk of iterable) {
      cursor = accessHandle.write(chunk, { at: cursor })
    }

    await accessHandle.flush()

    console.assert(cursor === realFile.size, 'file size and cursor are different')
  } finally {
    await accessHandle.close()
  }
}
