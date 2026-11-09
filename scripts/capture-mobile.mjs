import { chromium } from '/Users/miick/code/enroute-web/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';

const out='/Users/miick/code/prop-hunt-premium/recordings';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:720},isMobile:true,hasTouch:true,recordVideo:{dir:out,size:{width:1280,height:720}}});
const page=await context.newPage();
const startedAt=Date.now();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  for(let attempt=0;attempt<5;attempt++){
    await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#solo').click({force:true});
    await page.waitForSelector('#lobby:not(.hidden)',{timeout:15000});
    await page.locator('#start').click({force:true});
    await page.waitForSelector('#hud:not(.hidden)',{timeout:15000});
    if(await page.locator('#role').textContent()==='FUGITIF')break;
    if(attempt===4)throw new Error('Aucun rôle fugitif obtenu');
  }
  const gameOffset=(Date.now()-startedAt)/1000;
  await page.locator('#act-main').click({force:true});
  await page.waitForFunction(()=>document.querySelector('#act-lock')?.style.display==='block');
  await page.waitForTimeout(600);
  const stick=await page.locator('#stick').boundingBox();
  if(!stick)throw new Error('Joystick tactile absent');
  const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x,y-42,{steps:6});
  await page.waitForTimeout(2300);
  await page.mouse.up();
  await page.locator('#act-lock').click({force:true});
  await page.waitForTimeout(800);
  await page.locator('#act-lock').click({force:true});
  const look=await page.locator('#look-zone').boundingBox();
  if(look){const lx=look.x+look.width/2,ly=look.y+look.height/2;await page.mouse.move(lx,ly);await page.mouse.down();await page.mouse.move(lx+90,ly-18,{steps:8});await page.mouse.up();}
  await page.waitForTimeout(900);
  await page.locator('#act-main').click({force:true});
  await page.waitForTimeout(650);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-42,{steps:6});await page.waitForTimeout(1900);await page.mouse.up();
  await page.waitForTimeout(600);
  console.log(JSON.stringify({gameOffset,endOffset:(Date.now()-startedAt)/1000,errors}));
}finally{const video=page.video();await context.close();if(video)await video.saveAs(`${out}/mobile-play.webm`);await browser.close();}
