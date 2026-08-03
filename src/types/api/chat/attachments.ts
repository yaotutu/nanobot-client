export type AttachmentStatus = 'encoding' | 'ready' | 'error';

export interface ComposerAttachment {
  id: string;
  kind: 'image' | 'file';
  name: string;
  uri: string;
  mime: string;
  size: number;
  status: AttachmentStatus;
  dataUrl?: string;
  encodedBytes?: number;
  error?: string;
}
