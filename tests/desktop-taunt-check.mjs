import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const port=8795,origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),HIDE_MS:'120000'},stdio:'ignore'});
let browser;
try{
  let ready=false;
  for(let i=0;i<40;i++){try{const response=await fetch(`${origin}/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(ready,true);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:960,height:540}}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let fugitive=false;
  for(let attempt=0;attempt<7;attempt++){
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#solo').click({force:true,timeout:30000});
    await page.waitForSelector('#lobby:not(.hidden)',{timeout:15000});
    await page.locator('#start').click({force:true});
    await page.waitForSelector('#hud:not(.hidden)',{timeout:15000});
    if(await page.locator('#role').textContent()==='FUGITIF'){fugitive=true;break;}
    assert.equal(await page.locator('#act-taunt').isVisible(),false);
  }
  assert.equal(fugitive,true,'un fugitif obtenu dans le mode rapide');
  await page.locator('#howto-close').click({force:true});
  await page.keyboard.press('e');
  await page.waitForFunction(()=>!document.querySelector('#act-taunt')?.disabled,undefined,{timeout:5000});
  await page.keyboard.press('t');
  await page.waitForFunction(()=>/^\d+ S$/.test(document.querySelector('#taunt-state')?.textContent||''),undefined,{timeout:5000});
  assert.equal(await page.locator('#act-taunt').isDisabled(),true);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('OK ordinateur : E transforme, T nargue et recharge visible');
}finally{if(browser)await browser.close();server.kill();}
