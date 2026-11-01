const { app, BrowserWindow, ipcMain, Tray, nativeImage } = require('electron');
const path = require('node:path');

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 390,
    minHeight: 560,
    resizable: true,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.setMenu(null);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Postomat — мої посилки');
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  const { Menu } = require('electron');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Показати віджет', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Оновити статуси', click: () => { mainWindow.webContents.send('refresh'); } },
    { type: 'separator' },
    { label: 'Завершити Postomat', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('refresh', () => {
  if (mainWindow) mainWindow.webContents.send('refresh');
});
