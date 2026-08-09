'use strict';

const { contextBridge } = require('electron');

const modeArg = process.argv.find((a) => a.startsWith('--klima-mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'app';

contextBridge.exposeInMainWorld('klimaDesktop', {
  mode,
  platform: process.platform,
});
