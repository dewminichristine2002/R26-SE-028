import { useTranslation as useI18nTranslation } from 'react-i18next';

/**
 * Custom hook for translations
 * Usage: const { t } = useTranslation();
 * Then use: t('key.subkey') to get translated string
 */
export const useTranslation = () => {
  return useI18nTranslation();
};

export default useTranslation;
