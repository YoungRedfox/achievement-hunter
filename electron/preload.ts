import { contextBridge, ipcRenderer } from 'electron';
import type { AchSummary, Api, ScanProgress, UpdateStatus } from '../shared/types';

// Interfejs dostaje tylko te funkcje — żadnego dostępu do Node ani do kluczy
const api: Api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  connect: (profileInput, steamKey) => ipcRenderer.invoke('account:connect', profileInput, steamKey),
  disconnect: () => ipcRenderer.invoke('account:disconnect'),
  getLibrary: (refresh) => ipcRenderer.invoke('library:get', refresh),
  startScan: (force) => ipcRenderer.invoke('library:scan', force),
  getGame: (appid, refresh) => ipcRenderer.invoke('game:get', appid, refresh),
  getGuide: (appid, apiname, refresh) => ipcRenderer.invoke('guide:get', appid, apiname, refresh),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onScanProgress: (cb) => {
    const h = (_: unknown, p: ScanProgress) => cb(p);
    ipcRenderer.on('scan:progress', h);
    return () => ipcRenderer.off('scan:progress', h);
  },
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateStatus: (cb) => {
    const h = (_: unknown, s: UpdateStatus) => cb(s);
    ipcRenderer.on('update:status', h);
    return () => ipcRenderer.off('update:status', h);
  },
  onSummary: (cb) => {
    const h = (_: unknown, appid: number, s: AchSummary) => cb(appid, s);
    ipcRenderer.on('scan:summary', h);
    return () => ipcRenderer.off('scan:summary', h);
  },
};

contextBridge.exposeInMainWorld('api', api);
