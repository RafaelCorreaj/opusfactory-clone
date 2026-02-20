import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';
import { Worker } from 'worker_threads';
import { FFmpegService } from '../services/ffmpeg-service';
import { DatabaseService } from '../services/database';

const ffmpegService = new FFmpegService();
const db = new DatabaseService();
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }

  return mainWindow;
}

// ===== GERENCIADOR DE WORKERS =====
let activeWorkers = 0;
const MAX_WORKERS = 3;

function startQueueProcessing() {
  setInterval(async () => {
    if (activeWorkers >= MAX_WORKERS) return;

    const pending = db.getPendingQueueItems(MAX_WORKERS - activeWorkers);
    for (const item of pending) {
      const video = db.getVideoById(item.video_id);
      
      if (!video) {
        console.error(`❌ Vídeo não encontrado para o item da fila: ${item.video_id}`);
        db.updateQueueItem(item.id, 'failed', 0, 'Vídeo não encontrado');
        continue;
      }

      activeWorkers++;
      const worker = new Worker(path.join(__dirname, '../workers/queueWorker.js'), {
        workerData: {
          queueItemId: item.id,
          videoId: item.video_id,
          videoPath: video.path,
          openAIKey: db.getSetting('openAIKey') || null
        }
      });

      worker.on('message', (msg) => {
        activeWorkers--;
        if (mainWindow) {
          mainWindow.webContents.send('queue:update', msg);
        }
      });

      worker.on('error', (err) => {
        activeWorkers--;
        console.error('❌ Worker error:', err);
      });
    }
  }, 5000);
}

app.whenReady().then(() => {
  // ==================== HANDLERS BÁSICOS ====================
    ipcMain.handle('get-home-dir', () => {
    return require('os').homedir();
  });

    ipcMain.handle('db:get-video-by-path', async (event, path) => {
    return db.getVideoByPath(path);
  });

  ipcMain.handle('select-videos', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Vídeos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }]
    });
    return result.filePaths;
  });

  ipcMain.handle('get-videos-path', () => {
    return app.getPath('videos');
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      console.error('❌ Erro ao ler arquivo:', error);
      throw error;
    }
  });

  // ==================== HANDLERS DO BANCO ====================
  ipcMain.handle('db:save-video', async (event, video) => db.saveVideo(video));
  ipcMain.handle('db:save-clip', async (event, clip) => db.saveClip(clip));
  ipcMain.handle('db:get-history', async () => ({
    videos: db.getAllVideos(),
    clips: db.getAllClips()
  }));
  ipcMain.handle('db:get-clips-by-video', async (event, videoId) => db.getClipsByVideoId(videoId));
  ipcMain.handle('db:add-to-queue', async (event, videoId) => db.addToQueue(videoId));
  ipcMain.handle('db:get-queue-status', async () => db.getQueueStatus());
  ipcMain.handle('db:get-setting', async (event, key) => db.getSetting(key));
  ipcMain.handle('db:set-setting', async (event, key, value) => {
    db.setSetting(key, value);
    return true;
  });

  
  // ==================== HANDLERS DO FFMPEG ====================
  ipcMain.handle('ffmpeg:get-duration', async (event, videoPath) => {
    try {
      return await ffmpegService.getDuration(videoPath);
    } catch (error) {
      console.error('❌ Erro no ffmpeg:get-duration:', error);
      throw error;
    }
  });

  ipcMain.handle('ffmpeg:extract-audio', async (event, videoPath) => {
    const outputPath = path.join(app.getPath('temp'), `audio-${Date.now()}.mp3`);
    return await ffmpegService.extractAudio(videoPath, outputPath);
  });

  ipcMain.handle('ffmpeg:get-metadata', async (event, videoPath) => 
    ffmpegService.getMetadata(videoPath)
  );

  ipcMain.handle('ffmpeg:get-file-size', async (event, videoPath) => {
    try {
      const stats = await fs.stat(videoPath);
      return stats.size;
    } catch {
      return 0;
    }
  });

  ipcMain.handle('ffmpeg:cut-clip', async (event, videoPath, start, end, outputPath, resolution) => 
    ffmpegService.cutClip(videoPath, start, end, outputPath, resolution)
  );

  ipcMain.handle('ffmpeg:generate-thumbnail', async (event, videoPath, time, outputPath) => 
    ffmpegService.generateThumbnail(videoPath, time, outputPath)
  );

  // Registrar protocolo para servir arquivos de vídeo/thumbnail
  protocol.registerFileProtocol('video', (request, callback) => {
  const filePath = request.url.replace('video://', '');
  try {
    // Decodifica a URL (ex: C%3A%2FUsers... -> C:/Users...)
    const decodedPath = decodeURIComponent(filePath);
    console.log('📁 Protocolo video:// solicitado:', decodedPath);
    callback({ path: decodedPath });
  } catch (error) {
    console.error('❌ Erro ao processar protocolo video://:', error);
    callback({ error: -2 }); // arquivo não encontrado
  }
});

  // ==================== FINALIZAÇÃO ====================
  createWindow();
  startQueueProcessing();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  db.close();
});