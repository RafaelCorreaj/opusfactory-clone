import React from 'react';
import { useSettings } from '../contexts/SettingsContext';

const Settings: React.FC = () => {
  const { settings, updateSettings, testOpenAIKey } = useSettings();

  const handleMockToggle = () => {
    updateSettings({ useMock: !settings.useMock });
  };

  const handleModeChange = (mode: 'local' | 'openai') => {
    updateSettings({ selectedMode: mode });
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ openAIKey: e.target.value });
  };

  const handleTestKey = async () => {
    const isValid = await testOpenAIKey(settings.openAIKey);
    alert(isValid ? '✅ Chave válida' : '❌ Chave inválida');
  };

  return (
    <div className="main-card">
      <h1>⚙️ Configurações</h1>
      
      <div>
        <h3>Modo de teste</h3>
        <button onClick={handleMockToggle}>
          {settings.useMock ? 'MOCK ativado' : 'REAL ativado'}
        </button>
      </div>

      <div>
        <h3>Modo de processamento</h3>
        <button onClick={() => handleModeChange('local')} disabled={settings.selectedMode === 'local'}>
          Local
        </button>
        <button onClick={() => handleModeChange('openai')} disabled={settings.selectedMode === 'openai'}>
          OpenAI
        </button>
      </div>

      {settings.selectedMode === 'openai' && (
        <div>
          <h3>Chave da OpenAI</h3>
          <input
            type="password"
            value={settings.openAIKey}
            onChange={handleKeyChange}
            placeholder="sk-..."
          />
          <button onClick={handleTestKey}>Testar Conexão</button>
        </div>
      )}
    </div>
  );
};

export default Settings;