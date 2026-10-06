declare module '*.ttf?url' {
  const src: string;
  export default src;
}

interface SaveFilePickerTypes {
  description?: string;
  accept: Record<string, string[]>;
}

interface Window {
  showSaveFilePicker?(options?: {
    suggestedName?: string;
    types?: SaveFilePickerTypes[];
  }): Promise<{
    name: string;
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}
