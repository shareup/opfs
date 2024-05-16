import { browserName } from '@/detect-browser.ts'
import { randomId } from '@/encryption/mod.ts'
import { getAttachmentFile, isOPFSSupported, putAttachmentFile } from '@/opfs/mod.ts'
import { assert, assertEquals, test } from '@/test-utils/mod.ts'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

const expectedContent = 'Hello world sucka'
const itemId = randomId()
const attachmentId = randomId()
const fileName = 'hello.txt'

test('opfs is supported', () => {
  assert(isOPFSSupported(), 'OPFS is not supported')
})

test('can write a test file', async () => {
  const expectedBytes = encoder.encode(expectedContent)
  const expectedFile = new File([expectedBytes.buffer], fileName, { type: 'plain/text' })
  await putAttachmentFile(itemId, attachmentId, expectedFile)
})

test('can read a test file back out', async () => {
  if (browserName === 'Safari') {
    // NOTE: we know Safari cannot do this right now. We are waiting on
    // them to fix a bug.
    return
  }

  const actualFile = await getAttachmentFile(itemId, attachmentId, fileName)
  assert(actualFile, 'failed to get attachment file')
  assertEquals(actualFile.size, expectedContent.length)

  const actualBytes = await actualFile.arrayBuffer()
  const actualContent = decoder.decode(actualBytes)
  assertEquals(actualContent, expectedContent)
})

test('can iterate through and remove directories', async () => {
  const root = await navigator.storage.getDirectory()

  // @ts-ignore .values() exists
  for await (const handle of root.values()) {
    await root.removeEntry(handle.name, { recursive: true })
  }
})
