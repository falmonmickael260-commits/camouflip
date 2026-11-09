import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const port=8797,origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{
  cwd:process.cwd(),
  env:{...process.env,PORT:String(port)},
  stdio:'ignore',
});
let browser;
const errors=[];
try{
  let ready=false;
  for(let i=0;i<40;i++){
    try{const response=await fetch(`${origin}/health`);if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.equal(ready,true,'le serveur intégré démarre');
  const pageResponse=await fetch(origin);
  assert.equal(pageResponse.status,200);
  assert.match(await pageResponse.text(),/id="app"/);
  const musicResponse=await fetch(`${origin}/audio/menu-premium.m4a`,{method:'HEAD'});
  assert.equal(musicResponse.status,200);

  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader'],
  });
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  const host=await context.newPage(),guest=await context.newPage();
  host.on('pageerror',error=>errors.push(error.message));
  guest.on('pageerror',error=>errors.push(error.message));
  await host.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await host.locator('#create').click({force:true});
  await host.waitForSelector('#lobby:not(.hidden)',{timeout:20000});
  const code=await host.locator('#room-code').textContent();
  assert.match(code,/^[A-HJ-NP-Z2-9]{4}$/);
  await guest.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await guest.locator('#code').fill(code.toLowerCase(),{timeout:60000});
  await guest.locator('#join').click({force:true});
  await guest.waitForSelector('#lobby:not(.hidden)',{timeout:20000});
  await host.waitForFunction(()=>document.querySelector('#lobby-count')?.textContent?.startsWith('2/7'),{timeout:20000});
  await host.locator('#start').click({force:true});
  await host.waitForSelector('#hud:not(.hidden)',{timeout:20000});
  await guest.waitForSelector('#hud:not(.hidden)',{timeout:20000});
  const roles=[await host.locator('#role').textContent(),await guest.locator('#role').textContent()].sort();
  assert.deepEqual(roles,['CHASSEUR','FUGITIF']);
  if(!await host.locator('#howto').isVisible())await host.locator('#help').click({force:true});
  if(!await guest.locator('#howto').isVisible())await guest.locator('#help').click({force:true});
  assert.equal(await host.locator('#howto').isVisible(),true);
  assert.equal(await guest.locator('#howto').isVisible(),true);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(`OK version intégrée : HTTP, audio, salon ${code}, 2 joueurs, notice et WebSocket sur un seul port`);
}finally{
  if(browser)await browser.close();
  server.kill();
}
