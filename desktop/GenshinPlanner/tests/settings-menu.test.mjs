import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../wwwroot/'+name,import.meta.url),'utf8');
test('顶部仅保留账号切换、同步库存和设置入口',()=>{
 const header=read('index.html').match(/<header class="app-header">[\s\S]*?<\/header>/)[0];
 const visible=header.split('id="settingsMenu"')[0];
 assert.ok(visible.includes('id="accountSelect"'));
 assert.ok(visible.includes('id="syncInventoryButton"'));
 assert.ok(visible.includes('id="settingsButton"'));
 assert.ok(visible.includes('icons/inventory.png'));
 assert.ok(visible.includes('icons/settings.png'));
 assert.ok(visible.includes('id="appVersion"'));
 for(const id of ['addAccountButton','renameAccountButton','deleteAccountButton','mysOpen','refreshButton','importGoodButton','importButton','exportButton','checkUpdateButton']){
   assert.ok(header.includes('id="'+id+'"'));
   assert.ok(!visible.includes('id="'+id+'"'));
 }
 assert.ok(read('desktop-app.mjs').includes("icon.src='icons/training-guide.png'"));
});
test('游戏图标为本地 PNG 文件',()=>{
 for(const [filename,w,h] of [['inventory.png',60,64],['training-guide.png',48,48],['training-active.png',48,48]]){
   const data=readFileSync(new URL('../wwwroot/icons/'+filename,import.meta.url));
   assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(data.readUInt32BE(16),w);assert.equal(data.readUInt32BE(20),h);
 }
});
test('更新前保存规划，版本来自宿主，启动后自动检查更新',()=>{
 const source=read('desktop-app.mjs');
 assert.ok(source.includes("bridge('app.version')"));
 assert.ok(source.includes("await bridge('storage.save',{state:snapshot()});"));
 assert.ok(source.includes("bridge('update.install',{version:updateCandidate.latest})"));
 assert.ok(source.includes("void checkUpdate();"));
});

test('卡片使用新资源，前瞻星号和实例编号采用统一样式',()=>{
 const app=read('desktop-app.mjs'),css=read('desktop.css');
 assert.ok(app.includes("symbol.src='icons/training-active.png'"));
 assert.ok(app.includes("preview.textContent='*';preview.title=row.sourceTag;"));
 assert.ok(css.includes('.avatar-instance,.avatar-preview{'));
 assert.ok(css.includes('--badge-inset:2px'));
 assert.ok(!css.includes('brightness(0)'));
 assert.ok(read('index.html').includes('id="applyInventoryButton"'));
 assert.ok(app.includes('applyInventoryToManual(state)'));
});

test('账号信息紧跟下拉框，状态栏位于工作区底部，更新进度使用宿主消息',()=>{
 const html=read('index.html'),app=read('desktop-app.mjs');
 const header=html.match(/<header class="app-header">[\s\S]*?<\/header>/)[0];
 assert.ok(header.indexOf('id="accountSelect"')<header.indexOf('id="boundNickname"'));
 assert.ok(header.indexOf('id="boundUid"')<header.indexOf('class="header-spacer"'));
 assert.ok(!header.includes('id="dataStatus"'));
 assert.ok(html.match(/<footer class="status-bar"[\s\S]*?id="dataStatus"/));
 assert.ok(html.includes('<progress id="updateBar"'));
 assert.ok(app.includes("d?.event==='update.progress'"));
 assert.ok(app.includes("binding?'UID '+binding.uid:'未绑定米游社'"));
 assert.ok(app.includes("Math.floor(completed/total*100)"));
});
