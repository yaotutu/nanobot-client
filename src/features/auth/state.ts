// 认证状态的轻量公开入口：供应用编排层直接订阅，避免引入登录 UI 的启动依赖。
export {
  selectAuthPhase,
  selectAuthSessionEpoch,
  selectBootstrap,
  selectTokenGeneration,
  useAuthStore,
  type AuthPhase,
  type AuthStore,
} from './store';
