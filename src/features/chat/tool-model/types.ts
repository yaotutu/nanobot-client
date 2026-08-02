export type GenericToolStatus = 'running' | 'done' | 'error';
export type ToolFamily =
  | 'content-search'
  | 'file-search'
  | 'list'
  | 'read'
  | 'memory'
  | 'generic';

export interface ToolField {
  key:
    | 'query'
    | 'pattern'
    | 'glob'
    | 'path'
    | 'file_path'
    | 'url'
    | 'action'
    | 'key'
    | 'label'
    | 'name'
    | 'channel'
    | 'chat_id'
    | 'session_id'
    | 'ui_summary';
  value: string;
}

export interface GenericToolTrace {
  name: string;
  family: ToolFamily;
  groupKey: string;
  fields: ToolField[];
  collectedSource: boolean;
}

export interface GenericToolRunItem {
  trace: GenericToolTrace;
  status: GenericToolStatus;
  error?: string;
}

export interface GenericToolPresentation {
  status: GenericToolStatus;
  label: string;
  detail: string;
  aside: string;
}
