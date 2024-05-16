export type ID = string | Uint8Array

export type Fileable = {
  getFile(): File
}

export type Reply =
  & { type: 'putFile' }
  & (
    | { ok: false; error: string }
    | { ok: true }
  )

export type Message =
  & { ref: number }
  & (
    | {
      type: 'reply'
      payload: Reply
    }
    | {
      type: 'putFile'
      path: string
      file: FileSystemFileHandle | File
    }
  )
