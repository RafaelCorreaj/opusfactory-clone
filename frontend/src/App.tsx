import React, { useState } from 'react';  // Adicionamos o useState
import './App.css';

// Declaração do tipo para o Electron
declare global {
  interface Window {
    electron?: {
      selectVideos: () => Promise<string[]>;
    };
  }
}
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function App() {
  // Função para formatar bytes em MB/GB
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
  const [selectedMode, setSelectedMode] = useState<'local' | 'openai'>('local'); // NOVO
  const [videos, setVideos] = useState<{ path: string; name: string; size: number }[]>([]); // NOVO
const handleSelectVideos = async () => {
  try {
    console.log('Botão clicado!');
    
    if (!window.electron) {
      alert('Electron não disponível');
      return;
    }
    
    const selected = await window.electron.selectVideos();
    console.log('Selecionados:', selected);
    
    if (selected && selected.length > 0) {
      // Por enquanto vamos simular tamanhos
      const videoDetails = selected.map((path: string) => ({
        path,
        name: path.split('\\').pop() || path,
        size: Math.floor(Math.random() * 100000000), // Tamanho simulado
        status: 'pending'
      }));
      
      setVideos(videoDetails);
    }
  } catch (error) {
    console.error('Erro:', error);
  }
};
  return (
    <div className="main-card">
      <header className="app-header">
        <h1 className="app-title">OpusFactory</h1>
        <p className="app-subtitle">Clone do OpusClip com IA</p>
      </header>

      <section className="settings-section">
        <h2 className="settings-title">Configurações</h2>
        
        <div className="radio-group">
            {/* Modo Local */}
  <div className="radio-option">
    <input
      type="radio"
      id="local"
      name="mode"
      value="local"
      checked={selectedMode === 'local'}
      onChange={() => setSelectedMode('local')}
      className="radio-input"
      style={{ position: 'absolute', opacity: 0 }}
    />
    <label htmlFor="local" className="radio-label">
      <span className="radio-icon">🔒</span>
      <span className="radio-text">
        <span className="radio-title">Modo Local</span>
        <span className="radio-description">(grátis)</span>
      </span>
    </label>
  </div>
           {/* Modo OpenAI */}
  <div className="radio-option">
    <input
      type="radio"
      id="openai"
      name="mode"
      value="openai"
      checked={selectedMode === 'openai'}
      onChange={() => setSelectedMode('openai')}
      className="radio-input"
      style={{ position: 'absolute', opacity: 0 }}
    />
    <label htmlFor="openai" className="radio-label">
      <span className="radio-icon">☁️</span>
      <span className="radio-text">
        <span className="radio-title">OpenAI</span>
        <span className="radio-description">(requer chave)</span>
      </span>
    </label>
  </div>
</div>
      </section>

    <button className="primary-button" onClick={handleSelectVideos}>
     📂 Selecionar Vídeos
    </button>
    
{/* Lista de vídeos melhorada */}
{videos.length > 0 && (
  <div style={{ 
    marginTop: '24px',
    backgroundColor: '#0F172A',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #334155'
  }}>
    <h3 style={{ 
      color: '#F1F5F9', 
      fontSize: '15px', 
      marginBottom: '12px',
      fontWeight: 500,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      📋 Vídeos selecionados ({videos.length})
      <span style={{ color: '#94A3B8', fontSize: '13px' }}>
        {videos.filter(v => v.status === 'processed').length} processados
      </span>
    </h3>
    
    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
      {videos.map((video, index) => (
        <div key={index} style={{
          padding: '12px',
          backgroundColor: '#1E293B',
          borderRadius: '8px',
          marginBottom: '8px',
          border: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>
            {video.status === 'processed' ? '✅' : '⏳'}
          </span>
          <span style={{ fontSize: '20px' }}>🎬</span>
          
          <div style={{ flex: 1 }}>
            <div style={{ 
              color: '#F1F5F9', 
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '4px'
            }}>
              {video.name}
            </div>
            <div style={{
              display: 'flex',
              gap: '16px',
              color: '#94A3B8',
              fontSize: '12px'
            }}>
              <span>📦 {formatFileSize(video.size)}</span>
              <span>⏱️ --:--</span>
            </div>
          </div>
          
          <button
            onClick={() => setVideos(videos.filter((_, i) => i !== index))}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#EF4444',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2D3748'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            🗑️
          </button>
        </div>
      ))}
    </div>
  </div>
)}
</div>
  );
}

export default App;