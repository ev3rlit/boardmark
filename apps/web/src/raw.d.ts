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
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions
    ) => Promise<FileSystemDirectoryHandle>
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

  interface DirectoryPickerOptions {
    mode?: 'read' | 'readwrite'
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
    isSameEntry?(other: FileSystemHandle): Promise<boolean>
    queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  interface FileSystemDirectoryHandle {
    readonly kind: 'directory'
    readonly name: string
    getDirectoryHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<FileSystemDirectoryHandle>
    getFileHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<FileSystemFileHandle>
    queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  type FileSystemHandle = FileSystemFileHandle | FileSystemDirectoryHandle
}

export {}
