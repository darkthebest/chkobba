/**
 * NameForm is presentational: the parent passes back busy / serverError /
 * saved / renameAvailableAt. These tests drive the field with fireEvent and
 * render props the way FindingPlayers and the Settings sheet do.
 */
import { NAME_ERROR_CODES } from '@chkobba/protocol';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { NameForm, type NameFormError, type NameFormProps } from '@/components/lobby/NameForm';
import { i18n, LanguageProvider } from '@/i18n';
import { RLM } from '@/i18n/i18n';
import { aeb } from '@/i18n/locales/aeb';
import { en } from '@/i18n/locales/en';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function props(overrides: Partial<NameFormProps> = {}): NameFormProps {
  return { initialName: 'Hamza', mode: 'continue', onSubmit: jest.fn(), now: () => NOW, ...overrides };
}

async function type(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('name-form-input'), text);
}

async function blur(): Promise<void> {
  await fireEvent(screen.getByTestId('name-form-input'), 'blur');
}

async function submitWithKeyboard(): Promise<void> {
  await fireEvent(screen.getByTestId('name-form-input'), 'submitEditing');
}

describe('NameForm', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('client format errors', () => {
    it('should not show an error on a pristine empty field', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);

      // Act
      await blur();

      // Assert
      expect(screen.queryByTestId('name-form-error')).not.toBeOnTheScreen();
    });

    it('should not show an error while the player is still typing a short name', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);

      // Act
      await type('ab');

      // Assert
      expect(screen.queryByTestId('name-form-error')).not.toBeOnTheScreen();
    });

    it('should show the too-short error when a two-letter name is blurred', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);
      await type('ab');

      // Act
      await blur();

      // Assert
      expect(screen.getByTestId('name-form-error')).toHaveTextContent(en.name.errors.name_too_short);
    });

    it('should show the too-short error when a two-letter name is submitted', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);
      await type('ab');

      // Act
      await fireEvent.press(screen.getByTestId('name-form-submit'));

      // Assert
      expect(screen.getByTestId('name-form-error')).toHaveTextContent(en.name.errors.name_too_short);
    });

    it('should show the bad-characters error when the name contains a tatweel', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);
      await type('حمـزة');

      // Act
      await blur();

      // Assert
      expect(screen.getByTestId('name-form-error')).toHaveTextContent(en.name.errors.name_bad_chars);
    });

    it('should clear the format error as soon as the name becomes valid', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);
      await type('ab');
      await blur();

      // Act
      await type('abc');

      // Assert
      expect(screen.queryByTestId('name-form-error')).not.toBeOnTheScreen();
    });

    it('should not call onSubmit when the name is invalid', async () => {
      // Arrange
      const onSubmit = jest.fn();
      await render(<NameForm {...props({ initialName: '', onSubmit })} />);
      await type('ab');

      // Act
      await fireEvent.press(screen.getByTestId('name-form-submit'));

      // Assert
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should mark the field invalid while a format error shows', async () => {
      // Arrange
      await render(<NameForm {...props({ initialName: '' })} />);
      await type('ab');

      // Act
      await submitWithKeyboard();

      // Assert
      expect(screen.getByTestId('name-form-input')).toHaveProp('aria-invalid', true);
    });

    it('should submit the normalized name', async () => {
      // Arrange
      const onSubmit = jest.fn();
      await render(<NameForm {...props({ initialName: '', onSubmit })} />);
      await type('  Ab  cd ');

      // Act
      await fireEvent.press(screen.getByTestId('name-form-submit'));

      // Assert
      expect(onSubmit).toHaveBeenCalledWith('Ab cd');
    });

    it('should submit from the keyboard return key', async () => {
      // Arrange
      const onSubmit = jest.fn();
      await render(<NameForm {...props({ onSubmit })} />);

      // Act
      await submitWithKeyboard();

      // Assert
      expect(onSubmit).toHaveBeenCalledWith('Hamza');
    });
  });

  describe('server errors', () => {
    const codes: NameFormError[] = [...NAME_ERROR_CODES, 'network'];

    it.each(codes)('should show the localized message for the %s server error', async (code) => {
      // Arrange
      const serverError: NameFormError = code;

      // Act
      await render(<NameForm {...props({ serverError })} />);

      // Assert
      expect(screen.getByTestId('name-form-error')).toHaveTextContent(en.name.errors[code]);
    });

    it('should hide the server error once the player edits the name they sent', async () => {
      // Arrange
      const view = await render(<NameForm {...props()} />);
      await fireEvent.press(screen.getByTestId('name-form-submit'));
      await view.rerender(<NameForm {...props({ serverError: 'name_not_allowed' })} />);

      // Act
      await type('Hamza B');

      // Assert
      expect(screen.queryByTestId('name-form-error')).not.toBeOnTheScreen();
    });

    it('should show the server error again when the player types the sent name back', async () => {
      // Arrange
      const view = await render(<NameForm {...props()} />);
      await fireEvent.press(screen.getByTestId('name-form-submit'));
      await view.rerender(<NameForm {...props({ serverError: 'name_not_allowed' })} />);
      await type('Hamza B');

      // Act
      await type('Hamza');

      // Assert
      expect(screen.getByTestId('name-form-error')).toHaveTextContent(en.name.errors.name_not_allowed);
    });
  });

  describe('rename cooldown', () => {
    it('should show the minutes left, rounded up, when renaming opens in the future', async () => {
      // Arrange
      const renameAvailableAt = NOW + 30 * MINUTE + 1;

      // Act
      await render(<NameForm {...props({ mode: 'save', renameAvailableAt })} />);

      // Assert
      expect(screen.getByTestId('name-form-cooldown')).toHaveTextContent('You can rename again in 31 min');
    });

    it('should hide the cooldown when the cached time is already past', async () => {
      // Arrange
      const renameAvailableAt = NOW - MINUTE;

      // Act
      await render(<NameForm {...props({ mode: 'save', renameAvailableAt })} />);

      // Assert
      expect(screen.queryByTestId('name-form-cooldown')).not.toBeOnTheScreen();
    });

    it('should disable Save while the cooldown runs, even with a changed name', async () => {
      // Arrange
      await render(<NameForm {...props({ mode: 'save', renameAvailableAt: NOW + 5 * MINUTE })} />);

      // Act
      await type('Hamza B');

      // Assert
      expect(screen.getByTestId('name-form-submit')).toBeDisabled();
    });

    it('should enable Save once the cached cooldown is past and the name changed', async () => {
      // Arrange
      await render(<NameForm {...props({ mode: 'save', renameAvailableAt: NOW - MINUTE })} />);

      // Act
      await type('Hamza B');

      // Assert
      expect(screen.getByTestId('name-form-submit')).toBeEnabled();
    });
  });

  describe('modes', () => {
    it('should disable Save when the name is unchanged in save mode', async () => {
      // Arrange
      await render(<NameForm {...props({ mode: 'save' })} />);

      // Act
      await type('  Hamza ');

      // Assert
      expect(screen.getByTestId('name-form-submit')).toBeDisabled();
    });

    it('should label the button Save in save mode', async () => {
      // Arrange
      const mode = 'save';

      // Act
      await render(<NameForm {...props({ mode })} />);

      // Assert
      expect(screen.getByTestId('name-form-submit')).toHaveTextContent(en.name.save);
    });

    it('should enable Continue when the name is unchanged in continue mode', async () => {
      // Arrange
      const mode = 'continue';

      // Act
      await render(<NameForm {...props({ mode })} />);

      // Assert
      expect(screen.getByRole('button', { name: en.name.continue })).toBeEnabled();
    });

    it('should submit the unchanged name in continue mode', async () => {
      // Arrange
      const onSubmit = jest.fn();
      await render(<NameForm {...props({ onSubmit })} />);

      // Act
      await fireEvent.press(screen.getByTestId('name-form-submit'));

      // Assert
      expect(onSubmit).toHaveBeenCalledWith('Hamza');
    });

    it('should show the title only when asked', async () => {
      // Arrange
      const title = true;

      // Act
      await render(<NameForm {...props({ title })} />);

      // Assert
      expect(screen.getByRole('header')).toHaveTextContent(en.name.title);
    });

    it('should render no Cancel button without onCancel', async () => {
      // Arrange
      const onCancel = undefined;

      // Act
      await render(<NameForm {...props({ onCancel })} />);

      // Assert
      expect(screen.queryByTestId('name-form-cancel')).not.toBeOnTheScreen();
    });

    it('should call onCancel when Cancel is pressed', async () => {
      // Arrange
      const onCancel = jest.fn();
      await render(<NameForm {...props({ onCancel })} />);

      // Act
      await fireEvent.press(screen.getByTestId('name-form-cancel'));

      // Assert
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('busy and saved', () => {
    it('should disable the submit button while busy', async () => {
      // Arrange
      const busy = true;

      // Act
      await render(<NameForm {...props({ busy, onCancel: jest.fn() })} />);

      // Assert
      expect(screen.getByTestId('name-form-submit')).toBeDisabled();
    });

    it('should disable the Cancel button while busy', async () => {
      // Arrange
      const busy = true;

      // Act
      await render(<NameForm {...props({ busy, onCancel: jest.fn() })} />);

      // Assert
      expect(screen.getByTestId('name-form-cancel')).toBeDisabled();
    });

    it('should lock the field while busy', async () => {
      // Arrange
      const busy = true;

      // Act
      await render(<NameForm {...props({ busy })} />);

      // Assert
      expect(screen.getByTestId('name-form-input')).toHaveProp('editable', false);
    });

    it('should show the saved line after a successful save', async () => {
      // Arrange
      const saved = true;

      // Act
      await render(<NameForm {...props({ mode: 'save', saved })} />);

      // Assert
      expect(screen.getByTestId('name-form-saved')).toHaveTextContent(en.name.saved);
    });

    it('should use the testID prop as the prefix for every part', async () => {
      // Arrange
      const testID = 'settings-name';

      // Act
      await render(<NameForm {...props({ testID })} />);

      // Assert
      expect(screen.getByTestId('settings-name-hint')).toHaveTextContent(en.name.hint);
    });
  });

  describe('in Derja', () => {
    afterEach(async () => {
      await AsyncStorage.clear();
      await act(() => i18n.changeLanguage('en'));
    });

    it('should render the title in Derja', async () => {
      // Arrange
      const element = (
        <LanguageProvider initial="aeb">
          <NameForm {...props({ title: true })} />
        </LanguageProvider>
      );

      // Act
      await render(element);

      // Assert
      await waitFor(() => expect(screen.getByRole('header')).toHaveTextContent(`${RLM}${aeb.name.title}`));
    });

    it('should render a format error in Derja', async () => {
      // Arrange
      await render(
        <LanguageProvider initial="aeb">
          <NameForm {...props({ initialName: '' })} />
        </LanguageProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('name-form-hint')).toHaveTextContent(`${RLM}${aeb.name.hint}`));
      await type('ab');

      // Act
      await blur();

      // Assert
      expect(screen.getByTestId('name-form-error')).toHaveTextContent(`${RLM}${aeb.name.errors.name_too_short}`);
    });

    it('should render a server error in Derja', async () => {
      // Arrange
      const element = (
        <LanguageProvider initial="aeb">
          <NameForm {...props({ serverError: 'name_rate_limited' })} />
        </LanguageProvider>
      );

      // Act
      await render(element);

      // Assert
      await waitFor(() =>
        expect(screen.getByTestId('name-form-error')).toHaveTextContent(`${RLM}${aeb.name.errors.name_rate_limited}`),
      );
    });
  });
});
