export interface PickedAsset {
  uri: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  kind: 'image' | 'file';
  width?: number;
  height?: number;
}

export interface EncodedAttachment {
  dataUrl: string;
  bytes: number;
  mime: string;
  uri: string;
}
