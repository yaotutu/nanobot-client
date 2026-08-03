export interface OutboundMedia {
  data_url: string;
  name?: string;
}

export interface UIImage {
  url?: string;
  name?: string;
}

export interface UIMediaAttachment {
  kind: 'image' | 'video' | 'file';
  url?: string;
  name?: string;
}

export interface UICliAppAttachment {
  name: string;
  display_name?: string;
  category?: string;
  entry_point?: string;
  logo_url?: string | null;
  brand_color?: string | null;
}

export interface UIMcpPresetAttachment {
  name: string;
  display_name?: string;
  category?: string;
  transport?: string;
  status?: string;
  configured?: boolean;
  logo_url?: string | null;
  brand_color?: string | null;
}
