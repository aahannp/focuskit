const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

function checkForUpdates() {
  autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('update check failed:', e));
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    checkForUpdates();
    setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
  }
});
app.on('window-all-closed', () => app.quit());
