declare module '*.md?raw' {
  const content: string
  export default content
}

declare global {
  interface Window {
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions
    ) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (
      options?: SaveFilePickerOptions
    ) => Promise<FileSystemFileHandle>
  }

  interface OpenFilePickerOptions {
    excludeAcceptAllOption?: boolean
    multiple?: boolean
    types?: FilePickerAcceptType[]
  }

  interface SaveFilePickerOptions {
    excludeAcceptAllOption?: boolean
    suggestedName?: string
    types?: FilePickerAcceptType[]
  }

  interface FilePickerAcceptType {
    accept?: Record<string, string[]>
    description?: string
  }

  interface FileSystemWritableFileStream {
    close(): Promise<void>
    write(data: BlobPart): Promise<void>
  }

  interface FileSystemFileHandle {
    readonly kind: 'file'
    readonly name: string
    createWritable(): Promise<FileSystemWritableFileStream>
    getFile(): Promise<File>
  }
}

export {}
