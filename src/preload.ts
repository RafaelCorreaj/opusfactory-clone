import { contextBridge, ipcRenderer } from 'electron';

console.log('🔥 Preload: INICIANDO...');
console.log('🔥 Preload: contextBridge disponível?', !!contextBridge);
console.log('🔥 Preload: ipcRenderer disponível?', !!ipcRenderer);

try {
  contextBridge.exposeInMainWorld('electron', {

    // ─── Seleção de arquivos ────────────────────────────────────────────────
    selectVideos: () => {
      console.log('🔥 selectVideos chamado');
      return ipcRenderer.invoke('select-videos');
    },

    getVideosPath: () => ipcRenderer.invoke('get-videos-path'),

    // getHomeDir estava dentro de db — movido para o nível correto
    getHomeDir: () => ipcRenderer.invoke('get-home-dir'),

    readFile: (filePath: string) => {
      console.log('🔥 readFile:', filePath);
      return ipcRenderer.invoke('read-file', filePath);
    },

    // ─── Banco de dados ─────────────────────────────────────────────────────
    db: {
      saveVideo:       (video: any)            => ipcRenderer.invoke('db:save-video', video),
      saveClip:        (clip: any)             => ipcRenderer.invoke('db:save-clip', clip),
      getHistory:      ()                      => ipcRenderer.invoke('db:get-history'),
      getClipsByVideo: (videoId: number)       => ipcRenderer.invoke('db:get-clips-by-video', videoId),
      getSetting:      (key: string)           => ipcRenderer.invoke('db:get-setting', key),
      setSetting:      (key: string, val: string) => ipcRenderer.invoke('db:set-setting', key, val),
      addToQueue:      (videoId: number)       => ipcRenderer.invoke('db:add-to-queue', videoId),
      getQueueStatus:  ()                      => ipcRenderer.invoke('db:get-queue-status'),
      getVideoByPath:  (path: string)          => ipcRenderer.invoke('db:get-video-by-path', path),
      // ✅ REMOVIDO: cutClipWithCrop estava aqui por engano — pertence a ffmpeg
    },

    // ─── FFmpeg ─────────────────────────────────────────────────────────────
    ffmpeg: {
      extractAudio: (videoPath: string) =>
        ipcRenderer.invoke('ffmpeg:extract-audio', videoPath),

      getMetadata: (videoPath: string) =>
        ipcRenderer.invoke('ffmpeg:get-metadata', videoPath),

      getDuration: (videoPath: string) =>
        ipcRenderer.invoke('ffmpeg:get-duration', videoPath),

      getFileSize: (videoPath: string) =>
        ipcRenderer.invoke('ffmpeg:get-file-size', videoPath),

      cutClip: (videoPath: string, start: number, end: number, outputPath: string) =>
        ipcRenderer.invoke('ffmpeg:cut-clip', videoPath, start, end, outputPath),

      // ✅ ÚNICO ponto correto de cutClipWithCrop — dentro de ffmpeg
      cutClipWithCrop: (
        videoPath: string,
        start: number,
        end: number,
        outputPath: string,
        crop: { x: number; y: number; width: number; height: number }
      ) => ipcRenderer.invoke('ffmpeg:cut-clip-with-crop', videoPath, start, end, outputPath, crop),

      generateThumbnail: (videoPath: string, time: number, outputPath: string) =>
        ipcRenderer.invoke('ffmpeg:generate-thumbnail', videoPath, time, outputPath),

      onProgress: (callback: (progress: number) => void) => {
        ipcRenderer.on('ffmpeg:progress', (_, progress) => callback(progress));
      },
    },

    // ─── Cache ──────────────────────────────────────────────────────────────
    cache: {
      getTranscriptionCache:  (videoPath: string)          => ipcRenderer.invoke('cache:get-transcription', videoPath),
      saveTranscriptionCache: (videoPath: string, data: any) => ipcRenderer.invoke('cache:save-transcription', videoPath, data),
      getAnalysisCache:       (videoPath: string)          => ipcRenderer.invoke('cache:get-analysis', videoPath),
      saveAnalysisCache:      (videoPath: string, data: any) => ipcRenderer.invoke('cache:save-analysis', videoPath, data),
    },

  });

  console.log('🔥 Preload: API exposta com sucesso!');
} catch (error) {
  console.error('🔥 Preload: ERRO ao expor API:', error);
}
