import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const { chromium, webkit, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SESSION_TEST_OUTPUT ?? mkdtempSync(join(tmpdir(), 'reference-session-results-'));
console.log(`Screenshots: ${output}`);
mkdirSync(output, {recursive:true});
const live = process.argv[2];
const server = live ? null : await createServer({root,configFile:false,cacheDir:join(tmpdir(), 'reference-session-vite'),plugins:[react()],server:{host:'127.0.0.1',port:5187,strictPort:true}});
await server?.listen();
const url = live || 'http://127.0.0.1:5187/';
const lastKey='art-assistant:last-workspace', libraryKey='art-assistant:library-location';
const getStored = (page,key) => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
const near = (a,b,label,tolerance=1) => assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} vs ${b}`);
const ready = async page => {await page.locator('.app-shell[data-view]').waitFor();};
const previewReady = async page => page.waitForFunction(()=>{const i=document.querySelector('.reference-preview-image img');return i?.complete&&i.naturalWidth>0&&i.style.width;});
const viewRect = page=>page.locator('canvas[aria-label="Reference workspace canvas"]').boundingBox();
let browser;
try {
  if(!process.env.UPLOAD_ONLY) for (const [name,engine,options] of [['desktop',chromium,{viewport:{width:1440,height:1000}}],['mobile-webkit',webkit,{...devices['iPhone 13']} ]]) {
    browser=await engine.launch({headless:true});
    const context=await browser.newContext(options);
    let page=await context.newPage();
    const errors=[];
    context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url); await ready(page);
    await page.getByRole('button',{name:/Browse library/i}).click();
    await page.getByRole('button',{name:/48 references Master Drawings/}).click();
    await page.locator('.gallery-content').evaluate(el=>{el.scrollTop=700;});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).scrollTop>=690,libraryKey);
    const scroll=await page.locator('.gallery-content').evaluate(el=>el.scrollTop);
    await page.reload(); await ready(page);
    assert.equal(await page.locator('.gallery-card').count(),48);
    near(await page.locator('.gallery-content').evaluate(el=>el.scrollTop),scroll,'collection scroll');
    const title='Head of a Girl Frederic Leighton';
    await page.getByRole('button',{name:title,exact:true}).click(); await previewReady(page);
    const beforePreview=await getStored(page,libraryKey);
    const previewFrame=page.locator('.reference-preview-image');
    const previewRect=await previewFrame.boundingBox();
    if(name==='desktop') { await previewFrame.hover(); await page.mouse.wheel(0,-500); }
    else await previewFrame.dispatchEvent('wheel',{deltaY:-500,clientX:previewRect.x+previewRect.width*0.55,clientY:previewRect.y+previewRect.height*0.5});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).previewView.zoom>1,libraryKey);
    const previewSaved=await getStored(page,libraryKey);
    const previewSrc=await page.locator('.reference-preview-image img').getAttribute('src');
    // Close the page entirely, then open a new page in the same browser profile.
    await page.close(); page=await context.newPage(); await page.goto(url); await previewReady(page);
    assert.equal(await page.locator('.reference-preview-image img').getAttribute('src'),previewSrc);
    near((await getStored(page,libraryKey)).previewView.zoom,previewSaved.previewView.zoom,'preview zoom',0.0001);
    near((await getStored(page,libraryKey)).previewView.panX,previewSaved.previewView.panX,'preview pan X',0.001);
    near((await getStored(page,libraryKey)).previewView.panY,previewSaved.previewView.panY,'preview pan Y',0.001);
    await page.screenshot({path:`${output}/${live?'live':'local'}-${name}-preview.png`});
    await page.getByRole('button',{name:'Close preview',exact:true}).click();
    near(await page.locator('.gallery-content').evaluate(el=>el.scrollTop),beforePreview.scrollTop,'preview return scroll');
    await page.getByRole('button',{name:title,exact:true}).click(); await previewReady(page);
    await page.getByRole('button',{name:'Use reference',exact:true}).click();
    await page.locator('.app-shell[data-view="edit"]').waitFor();
    const canvas=page.locator('canvas[aria-label="Reference workspace canvas"]');
    await canvas.waitFor();
    await page.waitForFunction(()=>document.querySelector('canvas')?.style.width);
    const rect=await viewRect(page);
    await page.mouse.move(rect.x+rect.width*0.6,rect.y+rect.height*0.45);
    if(name==='desktop') {await page.keyboard.down('Control'); await page.mouse.wheel(0,-500); await page.keyboard.up('Control');}
    else await canvas.dispatchEvent('wheel',{deltaY:-500,ctrlKey:true,clientX:rect.x+rect.width*0.6,clientY:rect.y+rect.height*0.45});
    await page.locator('.view-fit-button').waitFor();
    await page.keyboard.down('Space'); await page.mouse.down(); await page.mouse.move(rect.x+rect.width*0.6+35,rect.y+rect.height*0.45+45,{steps:5}); await page.mouse.up(); await page.keyboard.up('Space');
    // Flush before the debounce expires, as happens when iOS backgrounds the app.
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    const saved=await getStored(page,lastKey);
    assert.ok(saved.state.view.zoom>1); assert.ok(Math.abs(saved.state.view.panX)>0.001);
    const adjusted=await viewRect(page);
    await page.reload(); await page.locator('.app-shell[data-view="edit"]').waitFor();
    await page.locator('.view-fit-button').waitFor();
    await page.waitForFunction(()=>document.querySelector('canvas')?.style.width);
    const restored=await viewRect(page);
    for(const k of ['x','y','width','height']) near(restored[k],adjusted[k],`workspace ${k}`,2);
    assert.deepEqual((await getStored(page,lastKey)).state.view,saved.state.view);
    await page.screenshot({path:`${output}/${live?'live':'local'}-${name}-study.png`});
    await page.getByRole('button',{name:'Workspace actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Save reference',exact:true}).click();
    await page.getByRole('button',{name:'Back to library',exact:true}).click();
    await page.locator('.app-shell[data-view="gallery"]').waitFor();
    near(await page.locator('.gallery-content').evaluate(el=>el.scrollTop),beforePreview.scrollTop,'study return scroll');
    await page.reload(); await ready(page);
    assert.equal(await page.locator('.app-shell').getAttribute('data-view'),'gallery');
    assert.deepEqual((await getStored(page,lastKey)).state.view,saved.state.view);
    await page.getByRole('button',{name:'Saved',exact:true}).click();
    await page.reload(); await page.locator('.saved-panel').waitFor();
    await page.locator('.saved-card-main').first().click(); await page.locator('.view-fit-button').waitFor();
    assert.deepEqual((await getStored(page,lastKey)).state.view,saved.state.view);
    await page.getByRole('button',{name:'Back to library',exact:true}).click();
    await page.getByRole('button',{name:'Library',exact:true}).click();
    await page.getByRole('region',{name:'Portrait studies',exact:true}).getByRole('button',{name:/View all/}).click();
    await page.locator('.gallery-content').evaluate(el=>{el.scrollTop=500;});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).scrollTop>=490,libraryKey);
    await page.reload(); await ready(page);
    assert.equal((await getStored(page,libraryKey)).categoryId,'portrait');
    near(await page.locator('.gallery-content').evaluate(el=>el.scrollTop),500,'category scroll');
    await page.getByRole('button',{name:'Upload',exact:true}).click();
    await page.getByRole('button',{name:/Continue/}).click();
    await page.locator('.view-fit-button').waitFor();
    assert.deepEqual((await getStored(page,lastKey)).state.view,saved.state.view);
    // A changed viewport retains the same normalized focal point.
    await page.setViewportSize({width:1000,height:700});
    await page.reload(); await page.locator('.view-fit-button').waitFor();
    assert.deepEqual((await getStored(page,lastKey)).state.view,saved.state.view);
    await page.locator('.view-fit-button').click();
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.deepEqual((await getStored(page,lastKey)).state.view,{zoom:1,panX:0,panY:0});
    // Old saved workspaces (without view) remain readable.
    await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));delete s.state.view;localStorage.setItem(key,JSON.stringify(s));},lastKey);
    // A navigation, rather than reload, would pagehide-save the current state over this fixture.
    await page.addInitScript(({key,stored})=>localStorage.setItem(key,JSON.stringify(stored)),{key:lastKey,stored:{...saved,state:{...saved.state,view:undefined}}});
    await page.reload(); await page.locator('.app-shell[data-view="edit"]').waitFor();
    assert.equal(await page.locator('.view-fit-button').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`${name}: collection/scroll, preview close/reopen/zoom, study pan/zoom, background flush, saved study, continue, resize, fit and legacy state passed.`);
    await context.close(); await browser.close(); browser=null;
  }
  // Separate contexts cover invalid/missing references, broken JSON and denied storage.
  browser=await chromium.launch({headless:true});
  if(!process.env.UPLOAD_ONLY) for(const mode of ['missing','corrupt','blocked']) {
    const context=await browser.newContext();
    await context.addInitScript(mode=>{
      if(mode==='blocked') {Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});return;}
      localStorage.setItem('art-assistant:navigation',JSON.stringify({version:1,view:'edit'}));
      localStorage.setItem('art-assistant:last-workspace',mode==='corrupt'?'{broken':JSON.stringify({version:1,image:{sourceType:'library',id:'removed-reference'},state:{}}));
      localStorage.setItem('art-assistant:library-location',mode==='corrupt'?'{broken':JSON.stringify({version:1,activeTab:'library',collectionId:'removed',previewId:'removed',categoryId:'removed',previewView:{zoom:-90,panX:'oops'}}));
    },mode);
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await ready(page);assert.equal(await page.locator('.app-shell').getAttribute('data-view'),'gallery');
    assert.deepEqual(errors,[]);console.log(`${mode}: safe gallery fallback passed.`);await context.close();
  }
  await browser.close(); browser=null;
  const profileDir=mkdtempSync(join(tmpdir(),'reference-session-test-'));
  let uploadContext=await chromium.launchPersistentContext(profileDir,{headless:true,...devices['iPhone 13'],defaultBrowserType:undefined});
  browser=uploadContext.browser();
  let uploadPage=await uploadContext.newPage();
  await uploadPage.goto(url); await ready(uploadPage);
  await uploadPage.locator('input[type="file"]').first().setInputFiles({name:'restore-fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#317a58"/><circle cx="120" cy="120" r="80" fill="#cb7640"/></svg>')});
  await uploadPage.locator('.app-shell[data-view="edit"]').waitFor();
  await uploadPage.waitForFunction(()=>document.querySelector('canvas')?.style.width);
  const cdp=await uploadContext.newCDPSession(uploadPage);
  // Real multi-touch input exercises the pinch path, not just the wheel path.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:320,id:0},{x:230,y:320,id:1}]});
  for(let step=1;step<=4;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130-step*12,y:320+step*5,id:0},{x:230+step*12,y:320+step*5,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await uploadPage.locator('.view-fit-button').waitFor();
  await uploadPage.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  const uploadSaved=await getStored(uploadPage,lastKey);
  assert.equal(uploadSaved.image.sourceType,'upload');assert.ok(uploadSaved.state.view.zoom>1.5);
  await uploadPage.reload();await uploadPage.locator('.app-shell[data-view="edit"]').waitFor();
  await uploadContext.close();
  uploadContext=await chromium.launchPersistentContext(profileDir,{headless:true,...devices['iPhone 13'],defaultBrowserType:undefined});
  browser=uploadContext.browser();
  uploadPage=await uploadContext.newPage();await uploadPage.goto(url);
  await uploadPage.locator('.app-shell[data-view="edit"]').waitFor();await uploadPage.locator('.view-fit-button').waitFor();
  await uploadPage.waitForFunction(()=>{const c=document.querySelector('canvas');if(!c)return false;const d=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return d[1]>90&&d[0]<100;});
  assert.deepEqual((await getStored(uploadPage,lastKey)).state.view,uploadSaved.state.view);
  await uploadPage.screenshot({path:`${output}/${live?'live':'local'}-touch-upload-restored.png`});
  console.log('Real touch pinch, visibility/background flush, uploaded IndexedDB image, and fresh browser-context restore passed.');
  await uploadContext.close();
} finally {await browser?.close();await server?.close();}
