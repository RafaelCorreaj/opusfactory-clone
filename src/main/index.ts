import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';

function createWindow() {
  const win = new BrowserWindow({
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
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }
}

// 👇 TUDO DENTRO DO app.whenReady
app.whenReady().then(() => {
  // Handler para selecionar vídeos - AGORA DENTRO DO whenReady
  ipcMain.handle('select-videos', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Vídeos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }
      ]
    });
    return result.filePaths;
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Para macOS: quando clicar no ícone do dock sem janelas abertas
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});