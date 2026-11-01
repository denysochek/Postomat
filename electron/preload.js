const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nova', {
  refresh: () => ipcRenderer.send('refresh'),
  quit: () => {
    const { app } = require('electron');
    app.quit();
  },
  hide: () => {
    const window = require('electron').remote.getCurrentWindow();
    window.hide();
  },
  minimize: () => {
    const window = require('electron').remote.getCurrentWindow();
    window.minimize();
  },
  preferences: (opts) => ipcRenderer.send('preferences', opts),
  testNotification: () => Promise.resolve('Тестове сповіщення надіслано'),
  copy: (text) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  },
  signIn: () => ipcRenderer.send('sign-in'),
  signOut: () => ipcRenderer.send('sign-out'),
  state: () => ({}),
});
