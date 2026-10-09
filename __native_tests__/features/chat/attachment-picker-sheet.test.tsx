import { fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native/icons/chevron-right', () => () => null);
jest.mock('lucide-react-native/icons/file-text', () => () => null);
jest.mock('lucide-react-native/icons/image', () => () => null);
jest.mock('lucide-react-native/icons/x', () => () => null);

import { AttachmentPickerSheet } from '@/features/chat/components/modals/AttachmentPickerSheet';
import { chatPaletteForTheme } from '@/features/chat/ui/chat-theme';

const baseProps = {
  colors: chatPaletteForTheme(false),
  onClose: jest.fn(),
  onPickDocuments: jest.fn(),
  onPickImages: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AttachmentPickerSheet', () => {
  it('选择照片和文件时分别调用对应入口', async () => {
    const result = await render(<AttachmentPickerSheet {...baseProps} visible />);
    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.attachmentPicker.imageTitle' }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    expect(baseProps.onPickImages).toHaveBeenCalledTimes(1);
    expect(baseProps.onPickDocuments).not.toHaveBeenCalled();

    await fireEvent.press(result.getByRole('button', { name: 'thread.composer.attachmentPicker.fileTitle' }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(2);
    expect(baseProps.onPickDocuments).toHaveBeenCalledTimes(1);
  });

  it('关闭按钮和 Android 返回都会收起弹窗', async () => {
    const result = await render(<AttachmentPickerSheet {...baseProps} visible />);
    await fireEvent.press(result.getAllByLabelText('thread.composer.attachmentPicker.close')[0]);
    fireEvent(
      result.getByTestId('attachment-picker-modal'),
      'requestClose',
    );
    expect(baseProps.onClose).toHaveBeenCalledTimes(2);
  });
});
