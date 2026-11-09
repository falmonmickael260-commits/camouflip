import { chromium } from '/Users/miick/code/enroute-web/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';

const root='/Users/miick/code/prop-hunt-premium';
const out=`${root}/recordings`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({
  headless:true,
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args:['--use-gl=angle','--use-angle=swiftshader'],
});
const options={viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}};
const hostContext=await browser.newContext(options);
const guestContext=await browser.newContext(options);
const host=await hostContext.newPage();
const guest=await guestContext.newPage();
const startedAt=Date.now();
const errors=[];
for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
try{
  await host.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded',timeout:60000});
  await guest.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded',timeout:60000});
  await host.locator('#name').fill('Camille');
  await guest.locator('#name').fill('Alex');
  await host.locator('#create').click({force:true});
  await host.waitForSelector('#lobby:not(.hidden)',{timeout:15000});
  const code=await host.locator('#room-code').textContent();
  await guest.locator('#code').fill(code);
  await guest.locator('#join').click({force:true});
  await guest.waitForSelector('#lobby:not(.hidden)',{timeout:15000});
  await host.locator('#start').click({force:true});
  await host.waitForSelector('#hud:not(.hidden)',{timeout:15000});
  await guest.waitForSelector('#hud:not(.hidden)',{timeout:15000});
  const hostRole=await host.locator('#role').textContent();
  const fugitive=hostRole==='FUGITIF'?host:guest;
  const hunter=hostRole==='CHASSEUR'?host:guest;
  const fugitiveOffset=(Date.now()-startedAt)/1000;
  await fugitive.bringToFront();
  await fugitive.keyboard.press('e');
  await fugitive.waitForTimeout(700);
  await fugitive.keyboard.down('w');
  await fugitive.waitForTimeout(3000);
  await fugitive.keyboard.up('w');
  await fugitive.waitForTimeout(600);
  await fugitive.keyboard.press('f');
  await fugitive.waitForTimeout(1100);
  await fugitive.keyboard.press('f');
  await fugitive.keyboard.down('a');
  await fugitive.waitForTimeout(1700);
  await fugitive.keyboard.up('a');
  await fugitive.keyboard.press('e');
  await fugitive.waitForTimeout(700);
  await fugitive.keyboard.down('w');
  await fugitive.waitForTimeout(1300);
  await fugitive.keyboard.up('w');
  await fugitive.waitForFunction(()=>document.querySelector('#phase')?.textContent?.includes('CHASSE'),{timeout:45000});
  const hunterOffset=(Date.now()-startedAt)/1000;
  await hunter.bringToFront();
  await hunter.keyboard.down('w');
  await hunter.waitForTimeout(2100);
  await hunter.keyboard.up('w');
  await hunter.keyboard.press('Space');
  await hunter.waitForTimeout(620);
  await hunter.keyboard.press('Space');
  await hunter.waitForTimeout(620);
  await hunter.keyboard.down('d');
  await hunter.waitForTimeout(1300);
  await hunter.keyboard.up('d');
  await hunter.keyboard.press('Space');
  await hunter.waitForTimeout(1200);
  console.log(JSON.stringify({code,hostRole,fugitiveOffset,hunterOffset,endOffset:(Date.now()-startedAt)/1000,errors}));
}finally{
  const hostVideo=host.video(),guestVideo=guest.video();
  await hostContext.close();await guestContext.close();
  if(hostVideo)await hostVideo.saveAs(`${out}/host.webm`);
  if(guestVideo)await guestVideo.saveAs(`${out}/guest.webm`);
  await browser.close();
}
