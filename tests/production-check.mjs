import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const port=8797,origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{
  cwd:process.cwd(),
  env:{...process.env,PORT:String(port),HIDE_MS:'20000',HUNT_MS:'1000'},
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
  await host.waitForFunction(()=>document.querySelector('#menu-logo')?.complete&&document.querySelector('#menu-logo')?.naturalWidth>0);
  console.log('Menu Camouflip chargé dans Chrome local');
  await host.locator('#name').fill('Alice');
  assert.equal(await host.locator('#player-avatar').textContent(),'A');
  await host.locator('#menu-settings').click();
  assert.equal(await host.locator('#settings-sound').isVisible(),true);
  await host.locator('#settings-sensitivity').click();
  await host.locator('#settings-quality').click();
  await host.locator('#menu-dialog-close').click();
  await host.locator('#nav-objects').click();
  assert.match(await host.locator('#menu-dialog-content').textContent(),/objets dans la maison/);
  await host.locator('#menu-dialog-close').click();
  const mobileLayout=await host.evaluate(()=>({viewport:innerWidth,left:document.querySelector('.menu-left')?.getBoundingClientRect().left,right:document.querySelector('.menu-right')?.getBoundingClientRect().right}));
  assert.ok(mobileLayout.left>=0&&mobileLayout.right<=mobileLayout.viewport,'les panneaux du menu restent entièrement dans l’écran');
  await host.screenshot({path:'/tmp/camouflip-menu-mobile.png'});
  assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'le menu mobile tient dans la largeur');
  await host.setViewportSize({width:667,height:375});
  const smallLayout=await host.evaluate(()=>({viewport:innerWidth,left:document.querySelector('.menu-left')?.getBoundingClientRect().left,right:document.querySelector('.menu-right')?.getBoundingClientRect().right}));
  assert.ok(smallLayout.left>=0&&smallLayout.right<=smallLayout.viewport,'le menu tient sur un petit téléphone');
  await host.screenshot({path:'/tmp/camouflip-menu-small.png'});
  assert.equal(await host.locator('#solo').isVisible(),true);
  await host.setViewportSize({width:1280,height:720});
  await host.screenshot({path:'/tmp/camouflip-menu-desktop.png'});
  await host.setViewportSize({width:844,height:390});
  await host.locator('#create').click({force:true});
  await host.waitForSelector('#lobby:not(.hidden)',{timeout:20000});
  console.log('Salon Camouflip créé dans Chrome local');
  await host.locator('#lobby-back').click();
  await host.waitForSelector('#menu:not(.hidden)',{timeout:5000});
  assert.equal(await host.locator('#name').inputValue(),'Alice');
  await host.locator('#create').click({force:true});
  await host.waitForSelector('#lobby:not(.hidden)',{timeout:20000});
  const code=await host.locator('#room-code').textContent();
  assert.match(code,/^[A-HJ-NP-Z2-9]{4}$/);
  await guest.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await guest.locator('#name').fill('Bob');
  await guest.locator('#mode-join').click();
  await guest.locator('#code').fill(code.toLowerCase(),{timeout:60000});
  await guest.locator('#join').click({force:true});
  await guest.waitForSelector('#lobby:not(.hidden)',{timeout:20000});
  console.log('Second joueur entré dans le salon local');
  await host.waitForFunction(()=>document.querySelector('#lobby-count')?.textContent?.startsWith('2/7'),{timeout:20000});
  await host.locator('#start').click({force:true});
  await host.waitForSelector('#hud:not(.hidden)',{timeout:20000});
  await guest.waitForSelector('#hud:not(.hidden)',{timeout:20000});
  const roles=[await host.locator('#role').textContent(),await guest.locator('#role').textContent()].sort();
  assert.deepEqual(roles,['CHASSEUR','FUGITIF']);
  const prop=(await host.locator('#role').textContent())==='FUGITIF'?host:guest;
  const hunter=prop===host?guest:host;
  assert.equal(await hunter.locator('#act-taunt').isVisible(),false);
  assert.equal(await prop.locator('#act-taunt').isVisible(),true);
  await prop.locator('#howto-close').click({force:true});
  await prop.locator('#act-main').click({force:true});
  await prop.waitForFunction(()=>!document.querySelector('#act-taunt')?.disabled,{timeout:5000});
  await prop.locator('#act-taunt').click({force:true});
  await prop.waitForFunction(()=>/^\d+ S$/.test(document.querySelector('#taunt-state')?.textContent||''),undefined,{timeout:5000});
  assert.equal(await prop.locator('#act-taunt').isDisabled(),true);
  if(!await host.locator('#howto').isVisible())await host.locator('#help').click({force:true});
  if(!await guest.locator('#howto').isVisible())await guest.locator('#help').click({force:true});
  assert.equal(await host.locator('#howto').isVisible(),true);
  assert.equal(await guest.locator('#howto').isVisible(),true);
  await host.waitForSelector('#results:not(.hidden)',{timeout:30000});
  await host.locator('#results-menu').click({force:true});
  await host.waitForSelector('#menu:not(.hidden)',{timeout:5000});
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(`OK version intégrée : menu mobile/desktop, réglages, pseudo, salon ${code}, nargue tactile, résultats et retours`);
}finally{
  if(browser)await browser.close();
  server.kill();
}
