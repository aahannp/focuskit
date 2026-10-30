const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 560,
    title: 'FocusKit',
    backgroundColor: '#0b0d12',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
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
