import { contextBridge, ipcRenderer } from 'electron';

console.log('🔥 Preload: INICIANDO...');
console.log('🔥 Preload: contextBridge disponível?', !!contextBridge);
console.log('🔥 Preload: ipcRenderer disponível?', !!ipcRenderer);

try {
  contextBridge.exposeInMainWorld('electron', {
    selectVideos: () => {
      console.log('🔥 selectVideos foi chamado!');
      return ipcRenderer.invoke('select-videos');
    },
    
    getVideosPath: () => ipcRenderer.invoke('get-videos-path'),

    readFile: (filePath: string) => {
      console.log('🔥 readFile foi chamado para:', filePath);
      return ipcRenderer.invoke('read-file', filePath);
    },
    
  db: {
    saveVideo: (video: any) => ipcRenderer.invoke('db:save-video', video),
    saveClip: (clip: any) => ipcRenderer.invoke('db:save-clip', clip),
    getHistory: () => ipcRenderer.invoke('db:get-history'),
    getClipsByVideo: (videoId: number) => ipcRenderer.invoke('db:get-clips-by-video', videoId),
    getSetting: (key: string) => ipcRenderer.invoke('db:get-setting', key),
    setSetting: (key: string, value: string) => ipcRenderer.invoke('db:set-setting', key, value),
    addToQueue: (videoId: number) => ipcRenderer.invoke('db:add-to-queue', videoId),
    getQueueStatus: () => ipcRenderer.invoke('db:get-queue-status'),
    getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
    getVideoByPath: (path: string) => ipcRenderer.invoke('db:get-video-by-path', path),
  },
    
    
    ffmpeg: {
      extractAudio: (videoPath: string) => 
        ipcRenderer.invoke('ffmpeg:extract-audio', videoPath),
      getMetadata: (videoPath: string) => 
        ipcRenderer.invoke('ffmpeg:get-metadata', videoPath),
      cutClip: (videoPath: string, start: number, end: number, outputPath: string, resolution?: string) =>
        ipcRenderer.invoke('ffmpeg:cut-clip', videoPath, start, end, outputPath, resolution),
      getDuration: (videoPath: string) => 
        ipcRenderer.invoke('ffmpeg:get-duration', videoPath),
      getFileSize: (videoPath: string) =>                     
        ipcRenderer.invoke('ffmpeg:get-file-size', videoPath),
      generateThumbnail: (videoPath: string, time: number, outputPath: string) =>
        ipcRenderer.invoke('ffmpeg:generate-thumbnail', videoPath, time, outputPath),
      onProgress: (callback: (progress: number) => void) => {
        ipcRenderer.on('ffmpeg:progress', (_, progress) => callback(progress));
      }
    }
  });
  
  console.log('🔥 Preload: API exposta com sucesso!');
} catch (error) {
  console.error('🔥 Preload: ERRO ao expor API:', error);
}