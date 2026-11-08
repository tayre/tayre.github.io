'use strict';
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const args of [
  [path.join(root,'tools/songbook.cjs'),'build','--check'],
  [path.join(__dirname,'song-model.test.cjs')],
  [path.join(__dirname,'notation.test.cjs')],
  [path.join(__dirname,'playback.test.cjs')],
  [path.join(__dirname,'import.test.cjs')]
]) {
  const result = spawnSync(process.execPath,args,{stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
