import {
  createElement,
  type ComponentType,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

interface DeferredComponentProps<Props extends object> {
  /** false 时不启动动态 import，适合只在弹窗真正打开后加载。 */
  enabled: boolean;
  /** 模块尚未加载完成时显示的轻量占位内容。 */
  fallback?: ReactNode;
  /** 原样传给目标组件的业务属性。 */
  componentProps: Props;
}

export type DeferredComponent<Props extends object> = ComponentType<DeferredComponentProps<Props>> & {
  /** 可提前下载和解析模块，但不会挂载目标组件。 */
  preload(): Promise<ComponentType<Props>>;
};

/**
 * 创建一个稳定的按需组件包装器。
 *
 * 之所以使用“模块级工厂 + 普通 effect/state”，而不是 React.lazy/Suspense，是因为
 * React Native 0.86/Fabric 在旧 Android 真机提交 Suspense 懒加载树时曾触发
 * MountingCoordinator 原生 SIGSEGV。包装器本身在模块初始化时创建，组件身份保持稳定；
 * 动态模块加载完成后，只通过一次普通 React 更新挂载目标组件。
 *
 * Promise 和最终组件都保存在工厂闭包中：Fast Refresh、路由重挂载或弹窗反复开关时，
 * 同一个模块只下载、解析一次。加载失败会清空 pending，下一次仍可重试；错误在渲染阶段
 * 抛给根 ErrorBoundary，从而进入项目已有的可视调试日志链路。
 */
export function createDeferredComponent<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
): DeferredComponent<Props> {
  let pending: Promise<ComponentType<Props>> | null = null;
  let cached: ComponentType<Props> | null = null;

  const loadOnce = (): Promise<ComponentType<Props>> => {
    if (!pending) {
      pending = load().then((LoadedComponent) => {
        cached = LoadedComponent;
        return LoadedComponent;
      }).catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const Deferred = function DeferredComponent({
    componentProps,
    enabled,
    fallback = null,
  }: DeferredComponentProps<Props>) {
    const [Component, setComponent] = useState<ComponentType<Props> | null>(() => cached);
    const [loadError, setLoadError] = useState<Error | null>(null);

    useEffect(() => {
      if (!enabled || Component) return;

      let active = true;
      void loadOnce().then(
        (LoadedComponent) => {
          if (active) setComponent(() => LoadedComponent);
        },
        (error: unknown) => {
          if (!active) return;
          setLoadError(error instanceof Error ? error : new Error(String(error)));
        },
      );

      return () => {
        active = false;
      };
    }, [Component, enabled]);

    if (loadError) throw loadError;
    if (!Component) return fallback;

    return createElement(Component, componentProps);
  } as DeferredComponent<Props>;

  Deferred.preload = loadOnce;
  return Deferred;
}
