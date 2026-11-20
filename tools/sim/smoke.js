'use strict';
// node smoke.js <repo> <dir>: the app starts on the stand and draws its home screen
const path = require('path');
(async () => {
    const stand = await require('./stand.js').start({ repo: process.argv[2], dir: process.argv[3], input: true });
    console.log('frames ' + stand.frames + ', screen ' + stand.menu.screen());
    await stand.turn(2);
    console.log('selected ' + stand.menu.selectedName());
    console.log(await stand.shot('smoke'));
    process.exit(0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
