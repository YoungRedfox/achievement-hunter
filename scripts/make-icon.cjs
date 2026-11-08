// Renderuje build/icon.svg do build/icon.png (512 px) silnikiem Electrona — bez dodatkowych zależności
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../build/icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`));
  await new Promise((r) => setTimeout(r, 600));
  const img = (await win.webContents.capturePage()).resize({ width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, '../build/icon.png'), img.toPNG());
  app.exit(0);
});
