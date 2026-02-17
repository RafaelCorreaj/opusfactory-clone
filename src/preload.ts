import { contextBridge, ipcRenderer } from 'electron';

console.log('🔥 Preload: INICIANDO...');
console.log('🔥 Preload: contextBridge disponível?', !!contextBridge);
console.log('🔥 Preload: ipcRenderer disponível?', !!ipcRenderer);

try {
  contextBridge.exposeInMainWorld('electron', {
    selectVideos: () => {
      console.log('🔥 selectVideos foi chamado!');
      return ipcRenderer.invoke('select-videos');
    }
  });
  console.log('🔥 Preload: API exposta com sucesso!');
} catch (error) {
  console.error('🔥 Preload: ERRO ao expor API:', error);
}