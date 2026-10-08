// Socket 传输能力的轻量公开入口，包含实现与窄类型，避免应用层导入内部文件。
export {
  NanobotSocket,
  createNanobotSocket,
  type MessageSendResult,
} from './socket-transport';
