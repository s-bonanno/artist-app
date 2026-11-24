import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const { chromium, webkit, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SESSION_TEST_OUTPUT ?? mkdtempSync(join(tmpdir(), 'view-lock-results-'));
mkdirSync(output, { recursive: true });
const live = process.argv[2];
const server = live ? null : await createServer({root,configFile:false,cacheDir:join(tmpdir(),'view-lock-vite'),plugins:[react()],server:{host:'127.0.0.1',port:5188,strictPort:true}});
await server?.listen();
const url = live ?? 'http://127.0.0.1:5188/';
const key = 'art-assistant:last-workspace';
const read = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,key);
const flush = page => page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
let browser;
try {
  for(const [name,engine,options] of [['desktop',chromium,{viewport:{width:1440,height:1000},hasTouch:true}],['mobile',webkit,devices['iPhone 13']]]) {
    browser=await engine.launch({headless:true});
    const context=await browser.newContext(options);
    await context.addInitScript(key=>{
      if(localStorage.getItem(key))return;
      localStorage.setItem(key,JSON.stringify({version:1,updatedAt:Date.now(),image:{sourceType:'library',id:'drawing-frederic-leighton-head-of-a-girl'},state:{view:{zoom:2,panX:0.12,panY:-0.1},viewport:{zoom:1.2,panX:5,panY:8}}}));
      localStorage.setItem('art-assistant:navigation',JSON.stringify({version:1,view:'edit'}));
    },key);
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);
    const canvas=page.locator('canvas[aria-label="Reference workspace canvas"]');
    await page.getByRole('button',{name:'Lock view',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('canvas')?.style.width);
    // Production image downloads can finish after the canvas and grid appear.
    // Wait for the light drawing paper, not merely a sized (empty) canvas.
    await page.waitForFunction(()=>{
      const c=document.querySelector('canvas');if(!c)return false;
      const ctx=c.getContext('2d');let painted=0;
      for(let i=0;i<10;i++) {
        const p=ctx.getImageData(c.width/2+i*7,c.height/2+i*11,1,1).data;
        if(Math.max(p[0],p[1],p[2])>65)painted++;
      }
      return painted>=8;
    });
    await flush(page);const before=await read(page);
    assert.equal(before.viewLocked,false,'Legacy studies start unlocked');
    const fit=page.locator('.view-fit-button');
    const lock=page.locator('.view-lock-button');
    const fitRect=await fit.boundingBox();const lockRect=await lock.boundingBox();
    assert.equal(fitRect.height,32,'Fit retains its original height');
    assert.equal(lockRect.height,fitRect.height);assert.equal(lockRect.width,32);
    const unlockedStyle=await lock.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    assert.equal(await fit.evaluate(el=>getComputedStyle(el).paddingLeft),'9px');
    await page.screenshot({path:join(output,`${live?'live':'local'}-${name}-unlocked.png`)});
    await page.getByRole('button',{name:'Lock view',exact:true}).click();
    await page.getByRole('status').filter({hasText:'View locked'}).waitFor();
    assert.equal(await page.locator('.view-fit-button').count(),0);
    assert.equal(await page.locator('.view-controls').innerText(),'','Only the icon remains when locked');
    assert.deepEqual(await lock.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})),unlockedStyle,'Locking does not change the button colours');
    assert.equal(await page.getByRole('button',{name:'Unlock view'}).getAttribute('aria-pressed'),'true');
    await page.screenshot({path:join(output,`${live?'live':'local'}-${name}-locked.png`)});
    const stage=await page.locator('.canvas-stage').boundingBox();const x=stage.x+stage.width/2,y=stage.y+stage.height/2;
    const lockedRect=await canvas.boundingBox();
    for(const ctrlKey of [false,true])await canvas.dispatchEvent('wheel',{ctrlKey,deltaY:-500,clientX:x,clientY:y});
    await page.keyboard.down('Space');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+30,{steps:4});await page.mouse.up();await page.keyboard.up('Space');
    await canvas.dispatchEvent('dblclick',{clientX:x,clientY:y});
    if(name==='desktop') {
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-40,y,id:0},{x:x+40,y,id:1}]});
      for(let step=1;step<=3;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40-step*15,y:y+step*10,id:0},{x:x+40+step*15,y:y+step*10,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await flush(page);let state=await read(page);
    assert.deepEqual(state.view,before.view);assert.deepEqual(state.viewport,before.viewport);
    const afterRect=await canvas.boundingBox();for(const field of ['x','y','width','height'])assert.ok(Math.abs(afterRect[field]-lockedRect[field])<1);
    await page.getByRole('button',{name:'Crop',exact:true}).click();
    for(const name of ['Zoom in','Zoom out','Fit','Fill','Move & Zoom'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Grid',exact:true}).click();await page.getByRole('button',{name:'Hide grid',exact:true}).click();
    await page.getByRole('button',{name:'Filters',exact:true}).click();await page.getByRole('slider',{name:/Exposure/}).fill('12');
    await page.getByRole('button',{name:'Study',exact:true}).click();await page.getByRole('button',{name:'Show study',exact:true}).click();
    await page.getByRole('button',{name:'Hide study',exact:true}).click();
    await page.getByRole('button',{name:'Palette',exact:true}).click();await page.getByRole('button',{name:'Sample',exact:true}).click();
    // Sample a visible part of the image, above the palette sheet.
    if(name==='mobile')await page.touchscreen.tap(x,stage.y+90);else await page.mouse.click(x,stage.y+90);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.palette.swatches.length>0,key);
    assert.equal(await page.getByRole('button',{name:'Close sampling',exact:true}).count(),0,'Sampling ends after adding a swatch');
    await flush(page);state=await read(page);
    assert.equal(state.viewLocked,true);assert.equal(state.grid.enabled,false);assert.equal(state.filters.exposure,12);assert.deepEqual(state.view,before.view);
    await page.reload();await page.getByRole('button',{name:'Unlock view',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('canvas')?.style.width);
    assert.equal(await page.locator('.view-fit-button').count(),0);
    await flush(page);assert.deepEqual((await read(page)).view,before.view);
    await page.getByRole('button',{name:'Unlock view',exact:true}).focus();await page.keyboard.press('Enter');
    await page.getByRole('status').filter({hasText:'View unlocked'}).waitFor();await page.locator('.view-fit-button').waitFor();
    await canvas.dispatchEvent('wheel',{ctrlKey:true,deltaY:-200,clientX:x,clientY:y});
    await page.waitForFunction(({key,zoom})=>JSON.parse(localStorage.getItem(key)).state.view.zoom>zoom,{key,zoom:before.view.zoom});
    await flush(page);assert.ok((await read(page)).view.zoom>before.view.zoom);
    // Locking while repositioning exits Crop's gesture mode immediately.
    await page.getByRole('button',{name:'Crop',exact:true}).click();await page.getByRole('button',{name:'Move & Zoom',exact:true}).click();
    await page.getByRole('button',{name:'Lock view',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Exit Move & Zoom',exact:true}).count(),0);
    await page.getByRole('button',{name:'Workspace actions',exact:true}).click();await page.getByRole('menuitem',{name:'Save reference',exact:true}).click();
    await page.getByRole('button',{name:'Back to library',exact:true}).click();await page.getByRole('button',{name:'Saved',exact:true}).click();await page.locator('.saved-card-main').first().click();
    await page.getByRole('button',{name:'Unlock view',exact:true}).waitFor();
    await page.getByRole('button',{name:'Back to library',exact:true}).click();await page.getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('button',{name:/Browse library/i}).click();
    await page.locator('.gallery-card').first().click();await page.getByRole('button',{name:'Use reference',exact:true}).click();
    await page.getByRole('button',{name:'Lock view',exact:true}).waitFor();await flush(page);assert.equal((await read(page)).viewLocked,false,'New references start unlocked');
    await page.getByRole('button',{name:'Lock view',exact:true}).click();await page.getByRole('button',{name:'Unlock view',exact:true}).waitFor();
    assert.equal(await page.locator('.view-fit-button').count(),0,'Lock is available even at Fit');
    assert.deepEqual(errors,[]);
    console.log(`${name}: lock UI/toast, gesture blocking, crop guards, grid/filters/study/sampling, reload, keyboard unlock, saved reference, new reference and Fit lock passed.`);
    await context.close();await browser.close();browser=null;
  }
} finally {await browser?.close();await server?.close();}
