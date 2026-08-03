export interface FilePreviewPayload {
  path: string;
  display_path: string;
  project_path: string;
  language: string;
  content: string;
  size: number;
  truncated: boolean;
}
