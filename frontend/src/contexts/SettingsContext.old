import React, { createContext, useContext, useEffect, useState } from 'react';

interface Settings {
  useMock: boolean;
  selectedMode: 'local' | 'openai';
  openAIKey: string;
  minClipDuration: number;
  maxClipDuration: number;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  testOpenAIKey: (key: string) => Promise<boolean>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({
    useMock: true,
    selectedMode: 'local',
    openAIKey: '',
    minClipDuration: 15,
    maxClipDuration: 60
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (!window.electron?.db) return;

      const useMock = await window.electron.db.getSetting('useMock');
      const selectedMode = await window.electron.db.getSetting('selectedMode');
      const openAIKey = await window.electron.db.getSetting('openAIKey');
      const minClipDuration = await window.electron.db.getSetting('minClipDuration');
      const maxClipDuration = await window.electron.db.getSetting('maxClipDuration');

      setSettings({
        useMock: useMock === 'true' || useMock === null ? true : false,
        selectedMode: (selectedMode as 'local' | 'openai') || 'local',
        openAIKey: openAIKey || '',
        minClipDuration: Number(minClipDuration) || 15,
        maxClipDuration: Number(maxClipDuration) || 60
      });
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      setSettings(prev => ({ ...prev, ...newSettings }));

      for (const [key, value] of Object.entries(newSettings)) {
        await window.electron.db.setSetting(key, String(value));
      }
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
    }
  };

  const testOpenAIKey = async (key: string): Promise<boolean> => {
    return key.startsWith('sk-');
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, testOpenAIKey }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings deve ser usado dentro de SettingsProvider');
  }
  return context;
};