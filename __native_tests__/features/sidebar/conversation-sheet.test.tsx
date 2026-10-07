import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import * as ReactNative from 'react-native';
import { StyleSheet } from 'react-native';

import { ConversationSheet } from '@/features/sidebar/components/ConversationSheet';
import type { SessionDeleteResult } from '@/types/api/chat/thread';
import type { ChatSummary, SidebarStatePayload } from '@/types/api/sidebar';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/colors';

// 直接返回翻译 key，仅为会话操作插入标题，既验证新文案契约又区分不同会话的入口。
// 不加载 i18n 初始化与语言资源，避免持久化偏好影响独立 Native 回归测试。
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) => options?.title ? `${key}: ${options.title}` : key,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

// 图标以 ESM 发布；只隔离装饰性图标，保留真实 Modal、列表模型、操作 hooks 和子层。
jest.mock('lucide-react-native/icons/search', () => () => null);
jest.mock('lucide-react-native/icons/settings', () => () => null);
jest.mock('lucide-react-native/icons/plus', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);
jest.mock('lucide-react-native/icons/archive', () => () => null);
jest.mock('lucide-react-native/icons/archive-restore', () => () => null);
jest.mock('lucide-react-native/icons/pencil', () => () => null);
jest.mock('lucide-react-native/icons/pin', () => () => null);
jest.mock('lucide-react-native/icons/pin-off', () => () => null);
jest.mock('lucide-react-native/icons/trash-2', () => () => null);
jest.mock('lucide-react-native/icons/chevron-right', () => () => null);
jest.mock('lucide-react-native/icons/folder', () => () => null);
jest.mock('lucide-react-native/icons/ellipsis', () => () => null);
jest.mock('lucide-react-native/icons/message-circle', () => () => null);

// 当前默认状态在 store 内部而非公开工厂中；按真实 SidebarStatePayload 构造独立数据，
// 不导入带网络/i18n 副作用的 store。每次返回新对象，测试之间不共享可变状态。
const createDefaultSidebarState = (): SidebarStatePayload => ({
  schema_version: 1,
  pinned_keys: [],
  archived_keys: [],
  title_overrides: {},
  project_name_overrides: {},
  tags_by_key: {},
  collapsed_groups: {},
  view: {
    density: 'comfortable', show_previews: false, show_timestamps: false,
    show_archived: false, sort: 'updated_desc',
  },
});

const createSession = (key: string, title: string): ChatSummary => ({
  key, title, channel: 'webui', chatId: key, preview: `${title}预览`,
  createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z',
});
const createProps = () => ({
  visible: true,
  colors: LIGHT_COLORS,
  sessions: [createSession('chat-1', '普通会话'), createSession('chat-2', '另一会话')],
  state: createDefaultSidebarState(),
  activeKey: 'chat-1',
  loading: false,
  connectionStatus: 'open' as const,
  networkAvailable: true,
  defaultWorkspacePath: '/workspace/default',
  onClose: jest.fn<() => void>(),
  onOpenSearch: jest.fn<() => void>(),
  onOpenSettings: jest.fn<() => void>(),
  onNewChat: jest.fn<() => void>(),
  onReconnect: jest.fn(async () => undefined),
  onNewChatInProject: jest.fn<(path: string, name: string) => void>(),
  onSelect: jest.fn<(key: string) => void>(),
  onTogglePinned: jest.fn<(key: string) => Promise<void>>(async () => undefined),
  onToggleArchived: jest.fn<(key: string) => Promise<void>>(async () => undefined),
  onToggleGroup: jest.fn<(groupId: string) => Promise<void>>(async () => undefined),
  onRename: jest.fn<(key: string, title: string) => Promise<void>>(async () => undefined),
  onRenameProject: jest.fn<(key: string, title: string) => Promise<void>>(async () => undefined),
  onSetShowArchived: jest.fn<(show: boolean) => Promise<void>>(async () => undefined),
  onDelete: jest.fn<(key: string) => Promise<SessionDeleteResult>>(async () => ({ deleted: true })),
} satisfies ComponentProps<typeof ConversationSheet>);

type NativeResult = Awaited<ReturnType<typeof render>>;
// 通过真实宿主节点的语义属性定位，不为测试给生产组件添加 testID 或 mock Modal。
const modalNode = (result: NativeResult) => result.container.queryAll(
  (node) => typeof node.props.onRequestClose === 'function',
)[0];
const sheetNode = (result: NativeResult) => result.container.queryAll(
  (node) => node.props.accessibilityViewIsModal === true,
)[0];
const requestBack = async (result: NativeResult) => {
  await fireEvent(modalNode(result), 'requestClose');
};
const openSessionActions = async (result: NativeResult) => {
  await fireEvent.press(result.getByLabelText('chat.actions: 普通会话'));
};
const projectProps = () => {
  const props = createProps();
  return {
    ...props,
    sessions: [{
      ...props.sessions[0],
      workspaceScope: { project_path: '/workspace/demo', project_name: '示例项目', access_mode: 'restricted' as const },
    }],
  };
};

// 宽高只在窗口边界注入；所有列表分组、归档过滤、重命名及返回逻辑均执行生产实现。
const setWindow = (width: number, height = 844) => jest.spyOn(ReactNative.Dimensions, 'get')
  .mockReturnValue({ width, height, scale: 1, fontScale: 1 });

describe('ConversationSheet 独立 Native 回归', () => {
  beforeEach(() => {
    setWindow(390);
  });
  afterEach(() => {
    // 恢复窗口、平台属性和 KAV 监视器，避免污染后续测试用例。
    jest.restoreAllMocks();
  });

  it('visible=false 时不渲染面板，也不调用任何业务回调', async () => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} visible={false} />);
    expect(result.toJSON()).toBeNull();
    Object.values(props).filter(jest.isMockFunction).forEach((callback) => {
      expect(callback).not.toHaveBeenCalled();
    });
  });

  it.each([
    { name: '手机', width: 390, height: 844, animation: 'slide', alignment: 'flex-end' },
    { name: '宽屏', width: 1024, height: 768, animation: 'fade', alignment: 'center' },
    { name: '手机断点前', width: 599, height: 844, animation: 'slide', alignment: 'flex-end' },
    { name: '宽屏断点', width: 600, height: 844, animation: 'fade', alignment: 'center' },
  ] as const)('$name 使用 $animation 动画且布局不再是左侧抽屉', async ({ width, height, animation, alignment }) => {
    setWindow(width, height);
    const result = await render(<ConversationSheet {...createProps()} />);
    expect(modalNode(result).props).toMatchObject({ animationType: animation, transparent: true, visible: true });
    expect(result.getByText('sidebar.conversations')).toBeTruthy();
    expect(result.queryByLabelText('sidebar.collapse')).toBeNull();
    const roots = result.container.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.flex === 1 && style?.justifyContent === alignment;
    });
    expect(roots.length).toBeGreaterThan(0);
    if (width >= 600) expect(StyleSheet.flatten(roots[0].props.style).alignItems).toBe('center');
    const sheetStyle = StyleSheet.flatten(sheetNode(result).props.style);
    expect(sheetStyle.width).toBe('100%');
    expect(sheetStyle.paddingBottom).toBeGreaterThanOrEqual(16);
    expect(sheetStyle.height).toBeLessThanOrEqual(height - 24);
    expect(sheetStyle.height).toBeCloseTo(height * (width < 600 ? 0.9 : 0.8));
    expect(sheetStyle.borderTopLeftRadius).toBeGreaterThan(0);
    if (width >= 600) {
      // maxWidth 是宽屏的固定上限；在 600px 断点由 width:100% 和父层 padding 限制实际宽度。
      expect(sheetStyle.maxWidth).toBe(640);
      expect(sheetStyle.borderRadius).toBeGreaterThan(0);
    }
  });

  it.each([
    { platform: 'android', behavior: 'height' },
    { platform: 'ios', behavior: 'padding' },
  ] as const)('$platform 的 KAV behavior 为 $behavior，并由内部容器测量剩余高度', async ({ platform, behavior }) => {
    // 只切换平台并观察真实 KAV 的 render 实例，保留原始渲染，不模拟键盘事件或 Yoga。
    // 最终方案恢复 Android height、iOS padding，面板高度另由内部 onLayout 的可用空间限制。
    jest.replaceProperty(ReactNative.Platform, 'OS', platform);
    const kavRender = jest.spyOn(ReactNative.KeyboardAvoidingView.prototype, 'render');
    await render(<ConversationSheet {...createProps()} />);
    expect(kavRender).toHaveBeenCalled();
    const kav = kavRender.mock.contexts[0] as ReactNative.KeyboardAvoidingView;
    expect(kav.props.behavior).toBe(behavior);
  });

  it.each([
    { name: '手机', width: 390, height: 844, ratio: 0.9, alignment: 'flex-end' },
    { name: '宽屏', width: 1024, height: 768, ratio: 0.8, alignment: 'center' },
  ] as const)('$name 根据内部实际 onLayout 收缩面板，恢复可用高度后正常布局不变', async ({ width, height, ratio, alignment }) => {
    setWindow(width, height);
    const result = await render(<ConversationSheet {...createProps()} />);
    const normalHeight = height * ratio;
    expect(StyleSheet.flatten(sheetNode(result).props.style).height).toBeCloseTo(normalHeight);
    // 只定位 KAV 内部负责测量的 flex:1 根容器，避免误触 FlatList 或 KAV 自身的 onLayout。
    // 真实事件触发生产 setAvailableHeight，不 mock useState，也不模拟 Yoga/键盘像素布局。
    const measuredRoots = result.container.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return typeof node.props.onLayout === 'function' && style?.flex === 1 && style?.justifyContent === alignment;
    });
    expect(measuredRoots).toHaveLength(1);
    await fireEvent(measuredRoots[0], 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    expect(StyleSheet.flatten(sheetNode(result).props.style).height).toBeCloseTo(normalHeight);

    await fireEvent(measuredRoots[0], 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 420 } } });
    const constrainedHeight = StyleSheet.flatten(sheetNode(result).props.style).height;
    // 使用安全区 mock 的 top:24 与面板预留 12；断言数值高度改变，而非只检查百分比上限。
    expect(constrainedHeight).toBeLessThanOrEqual(420 - 24 - 12);
    expect(constrainedHeight).toBe(420 - 24 - 12);

    await fireEvent(measuredRoots[0], 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    expect(StyleSheet.flatten(sheetNode(result).props.style).height).toBeCloseTo(normalHeight);
  });

  it('主面板保留 maxHeight:100% 和内容 wrapper 的原生布局约束', async () => {
    const result = await render(<ConversationSheet {...createProps()} />);
    // 保留百分比上限作为样式契约；最终收缩逻辑由上面的真实 onLayout 回归验证，
    // 这里不把百分比属性当作实际键盘布局或数值高度计算的替代。
    expect(StyleSheet.flatten(sheetNode(result).props.style).maxHeight).toBe('100%');
    const content = result.container.queryAll((node) => node.props.importantForAccessibility === 'auto');
    expect(content).toHaveLength(1);
    expect(StyleSheet.flatten(content[0].props.style).flex).toBe(1);
    // 保留原生 wrapper，避免 Android 布局折叠移除承载读屏隔离属性的节点。
    expect(content[0].props.collapsable).toBe(false);
  });

  it('操作和重命名子层隔离主列表读屏入口，返回后恢复可访问性', async () => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    expect(result.getByLabelText('普通会话')).toBeTruthy();
    expect(result.getByLabelText('另一会话')).toBeTruthy();

    // 两种子层都经历打开、无障碍隔离和返回；只有真实 hooks 驱动状态变化。
    for (const layer of ['action', 'rename'] as const) {
      await openSessionActions(result);
      if (layer === 'rename') {
        await fireEvent.press(result.getByRole('button', { name: 'chat.rename' }));
        expect(result.getByLabelText('chat.renameTitle')).toBeTruthy();
      } else {
        expect(result.getByRole('button', { name: 'chat.rename' })).toBeTruthy();
      }
      // 默认查询遵守无障碍隐藏；显式包含隐藏节点时列表仍在，避免用卸载掩盖读屏问题。
      expect(result.queryByLabelText('普通会话')).toBeNull();
      expect(result.queryByLabelText('另一会话')).toBeNull();
      expect(result.getByLabelText('普通会话', { includeHiddenElements: true })).toBeTruthy();
      const hiddenContent = result.container.queryAll(
        (node) => node.props.importantForAccessibility === 'no-hide-descendants',
      );
      expect(hiddenContent).toHaveLength(1);
      expect(hiddenContent[0].props).toMatchObject({ accessibilityElementsHidden: true, collapsable: false });
      // 外层面板和当前子层各自声明 modal，锁定子层读屏焦点边界。
      expect(result.container.queryAll((node) => node.props.accessibilityViewIsModal === true)).toHaveLength(2);

      await requestBack(result);
      expect(result.getByLabelText('普通会话')).toBeTruthy();
      expect(result.getByLabelText('另一会话')).toBeTruthy();
      const restoredContent = result.container.queryAll(
        (node) => node.props.importantForAccessibility === 'auto',
      );
      expect(restoredContent).toHaveLength(1);
      expect(restoredContent[0].props).toMatchObject({ accessibilityElementsHidden: false, collapsable: false });
      expect(result.container.queryAll((node) => node.props.accessibilityViewIsModal === true)).toHaveLength(1);
    }
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onRename).not.toHaveBeenCalled();
  });

  it('项目操作层声明 modal，隐藏底层会话并在返回后恢复', async () => {
    const props = projectProps();
    const result = await render(<ConversationSheet {...props} />);
    await fireEvent.press(result.getByLabelText('chat.renameProjectTitle: 示例项目'));
    expect(result.getByRole('button', { name: 'chat.renameProjectTitle' })).toBeTruthy();
    expect(result.queryByLabelText('普通会话')).toBeNull();
    expect(result.getByLabelText('普通会话', { includeHiddenElements: true })).toBeTruthy();
    // 外层面板已声明 modal；第二个节点必须来自项目操作层，避免漏掉项目分支。
    expect(result.container.queryAll((node) => node.props.accessibilityViewIsModal === true)).toHaveLength(2);
    await requestBack(result);
    expect(result.getByLabelText('普通会话')).toBeTruthy();
    expect(result.container.queryAll((node) => node.props.accessibilityViewIsModal === true)).toHaveLength(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it.each([0, 1])('关闭入口 %i（遮罩/标题按钮）直接关闭没有子层的面板', async (index) => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    // accessibilityViewIsModal 会把遮罩标记为无障碍隐藏；它仍须响应真实触摸。
    const closeButtons = result.getAllByRole('button', { name: 'sidebar.closeConversations', includeHiddenElements: true });
    expect(closeButtons).toHaveLength(2);
    await fireEvent.press(closeButtons[index]);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('没有子层时系统返回关闭面板', async () => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    await requestBack(result);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('新建会话先执行回调再关闭面板', async () => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    await fireEvent.press(result.getByRole('button', { name: 'sidebar.newChat' }));
    expect(props.onNewChat).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onNewChat.mock.invocationCallOrder[0]).toBeLessThan(props.onClose.mock.invocationCallOrder[0]);
  });

  it('真实列表标记当前会话，选择另一会话后关闭', async () => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    expect(result.getByLabelText('普通会话').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(result.getByLabelText('另一会话'));
    expect(props.onSelect).toHaveBeenCalledWith('chat-2');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSelect.mock.invocationCallOrder[0]).toBeLessThan(props.onClose.mock.invocationCallOrder[0]);
  });

  it.each([
    { label: 'sidebar.searchAria', callback: 'onOpenSearch' },
    { label: 'sidebar.settings', callback: 'onOpenSettings' },
  ] as const)('$label 委派给父层回调', async ({ label, callback }) => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    await fireEvent.press(result.getByRole('button', { name: label }));
    expect(props[callback]).toHaveBeenCalledTimes(1);
    expect(props.onNewChat).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('归档 toggle 根据真实 state 过滤列表，并支持显示和隐藏两向切换', async () => {
    const props = createProps();
    const state = { ...props.state, archived_keys: ['chat-2'] };
    const result = await render(<ConversationSheet {...props} state={state} />);
    expect(result.queryByLabelText('另一会话')).toBeNull();
    await fireEvent.press(result.getByRole('button', { name: 'chat.groups.archived (1)' }));
    expect(props.onSetShowArchived).toHaveBeenLastCalledWith(true);
    // 面板由父层传入 state；回调成功后的新状态用 rerender 模拟，不伪造 hooks 的返回值。
    await result.rerender(<ConversationSheet {...props} state={{ ...state, view: { ...state.view, show_archived: true } }} />);
    expect(result.getByLabelText('另一会话')).toBeTruthy();
    await fireEvent.press(result.getByRole('button', { name: 'chat.hideArchived' }));
    expect(props.onSetShowArchived).toHaveBeenLastCalledWith(false);
    expect(props.onSetShowArchived).toHaveBeenCalledTimes(2);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('没有归档会话时不展示归档 toggle', async () => {
    const result = await render(<ConversationSheet {...createProps()} />);
    expect(result.queryByText(/^chat.groups.archived/)).toBeNull();
    expect(result.queryByText('chat.hideArchived')).toBeNull();
  });

  it.each(['chat.pin', 'chat.unpin', 'chat.archive', 'chat.unarchive'] as const)('会话操作 %s 保留正确 key 且仅退出操作子层', async (label) => {
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    if (label === 'chat.unpin') {
      await result.rerender(<ConversationSheet {...props} state={{ ...props.state, pinned_keys: ['chat-1'] }} />);
    } else if (label === 'chat.unarchive') {
      await result.rerender(<ConversationSheet {...props} state={{ ...props.state, archived_keys: ['chat-1'], view: { ...props.state.view, show_archived: true } }} />);
    }
    await openSessionActions(result);
    await fireEvent.press(result.getByRole('button', { name: label }));
    const callback = label === 'chat.pin' || label === 'chat.unpin' ? props.onTogglePinned : props.onToggleArchived;
    expect(callback).toHaveBeenCalledWith('chat-1');
    expect(result.queryByText('chat.rename')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('删除会话保留确认流程，确认前不删除且不关闭主面板', async () => {
    const alert = jest.spyOn(ReactNative.Alert, 'alert').mockImplementation(() => undefined);
    const props = createProps();
    const result = await render(<ConversationSheet {...props} />);
    await openSessionActions(result);
    await fireEvent.press(result.getByRole('button', { name: 'chat.delete' }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0].slice(0, 2)).toEqual(['deleteConfirm.title', 'deleteConfirm.description']);
    expect(props.onDelete).not.toHaveBeenCalled();
    // 只模拟原生确认按钮，不 mock 删除 hook；断言客户端仅传 key，不附带级联删除参数。
    const confirm = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive');
    expect(confirm?.onPress).toBeDefined();
    confirm?.onPress?.();
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith('chat-1');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(result.queryByRole('button', { name: 'chat.delete' })).toBeNull();
  });

  it.each(['session', 'project', 'rename'] as const)('系统返回先退出 %s 子层，第二次才关闭面板', async (layer) => {
    const props = layer === 'project' ? projectProps() : createProps();
    const result = await render(<ConversationSheet {...props} />);
    if (layer === 'project') {
      await fireEvent.press(result.getByLabelText('chat.renameProjectTitle: 示例项目'));
      expect(result.getByRole('button', { name: 'chat.renameProjectTitle' })).toBeTruthy();
    } else {
      await openSessionActions(result);
      if (layer === 'rename') {
        await fireEvent.press(result.getByRole('button', { name: 'chat.rename' }));
        await fireEvent.changeText(result.getByLabelText('chat.renameTitle'), '尚未保存');
      }
    }
    await requestBack(result);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onRename).not.toHaveBeenCalled();
    expect(props.onRenameProject).not.toHaveBeenCalled();
    expect(result.queryByRole('button', { name: 'chat.rename' })).toBeNull();
    expect(result.queryByRole('button', { name: 'chat.renameProjectTitle' })).toBeNull();
    expect(result.queryByLabelText('chat.renameTitle')).toBeNull();
    expect(result.getByText('sidebar.conversations')).toBeTruthy();
    await requestBack(result);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['session', 'project'] as const)('保存 %s 重命名使用真实 hook 去除首尾空白且不关闭面板', async (kind) => {
    const props = kind === 'project' ? projectProps() : createProps();
    const result = await render(<ConversationSheet {...props} />);
    const titleKey = kind === 'project' ? 'chat.renameProjectTitle' : 'chat.renameTitle';
    if (kind === 'project') {
      await fireEvent.press(result.getByLabelText('chat.renameProjectTitle: 示例项目'));
      await fireEvent.press(result.getByRole('button', { name: titleKey }));
    } else {
      await openSessionActions(result);
      await fireEvent.press(result.getByRole('button', { name: 'chat.rename' }));
    }
    expect(result.getByLabelText(titleKey).props.value).toBe(kind === 'project' ? '示例项目' : '普通会话');
    await fireEvent.changeText(result.getByLabelText(titleKey), '  新名称  ');
    await fireEvent.press(result.getByText('chat.renameSave'));
    const callback = kind === 'project' ? props.onRenameProject : props.onRename;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(kind === 'project' ? '/workspace/demo' : 'chat-1', '新名称');
    expect(result.queryByLabelText(titleKey)).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('项目分组保留折叠和项目内新建回调', async () => {
    const props = projectProps();
    const result = await render(<ConversationSheet {...props} />);
    await fireEvent.press(result.getByLabelText('chat.groups.projects: 示例项目'));
    expect(props.onToggleGroup).toHaveBeenCalledWith('project:/workspace/demo');
    await fireEvent.press(result.getByLabelText('chat.newInProject'));
    expect(props.onNewChatInProject).toHaveBeenCalledWith('/workspace/demo', '示例项目');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: '浅色', colors: LIGHT_COLORS },
    { name: '深色', colors: DARK_COLORS },
  ])('$name主题同时应用于主面板、选中会话、操作和重命名子层', async ({ colors }) => {
    const result = await render(<ConversationSheet {...createProps()} colors={colors} />);
    expect(StyleSheet.flatten(sheetNode(result).props.style).backgroundColor).toBe(colors.card);
    expect(StyleSheet.flatten(result.getByText('普通会话').props.style).color).toBe(colors.foreground);
    expect(StyleSheet.flatten(result.getByLabelText('普通会话').props.style).backgroundColor).toBe(colors.pressed);
    await openSessionActions(result);
    expect(StyleSheet.flatten(result.getByText('chat.rename').props.style).color).toBe(colors.foreground);
    await fireEvent.press(result.getByRole('button', { name: 'chat.rename' }));
    expect(StyleSheet.flatten(result.getByLabelText('chat.renameTitle').props.style)).toMatchObject({
      color: colors.foreground, borderColor: colors.border,
    });
    // 检查实际重命名卡片背景，而非只检查样式工厂，防止主题未传入子组件。
    const renameCards = result.container.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.maxWidth === 420 && style?.backgroundColor === colors.card;
    });
    expect(renameCards).toHaveLength(1);
  });
});
