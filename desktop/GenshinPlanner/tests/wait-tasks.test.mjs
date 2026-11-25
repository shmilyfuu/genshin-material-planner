import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createWaitTasks} from '../wwwroot/wait-tasks.mjs';
function fixture(){
  let value,seq=0;const timers=new Map();
  const tasks=createWaitTasks(v=>value=v,{setTimer:fn=>{timers.set(++seq,fn);return seq;},clearTimer:id=>timers.delete(id)});
  return {tasks,value:()=>value,tick:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}},timers};
}
test('操作立即锁定，短任务取消显示计时',()=>{
 const f=fixture(),a=f.tasks.begin('a','加载',10);
 assert.deepEqual(f.value(),{locked:true,visible:false,text:'加载',size:1});
 a.end();f.tick();assert.equal(f.value().locked,false);assert.equal(f.value().visible,false);assert.equal(f.timers.size,0);
});
test('重叠任务使用独立锁，优先级和进度原位更新',()=>{
 const f=fixture(),a=f.tasks.begin('lists','资料',20);f.tick();
 const b=f.tasks.begin('sync','同步',50),c=f.tasks.begin('sync','同步2',50);
 assert.equal(f.value().text,'同步');assert.equal(f.value().visible,true);
 f.tasks.update('sync','50%');assert.equal(f.value().text,'50%');
 b.end();b.end();assert.equal(f.value().size,2);assert.equal(f.value().visible,true);
 c.end();assert.equal(f.value().text,'资料');assert.equal(f.value().locked,true);
 a.end();assert.equal(f.value().locked,false);assert.equal(f.value().visible,false);
});
test('成功、拒绝和异常都释放操作锁',async()=>{
 const f=fixture();
 assert.equal(await f.tasks.run('a','加载',1,async()=>42),42);
 await assert.rejects(f.tasks.run('b','加载',1,async()=>{throw Error('timeout');}),/timeout/);
 assert.equal(f.value().locked,false);assert.equal(f.timers.size,0);
});
test('中心提示位于全部弹窗之外且没有遮罩色',()=>{
 const read=name=>readFileSync(new URL('../wwwroot/'+name,import.meta.url),'utf8');
 const html=read('index.html'),css=read('desktop.css'),app=read('desktop-app.mjs'),mys=read('mys-panel.mjs');
 assert.ok(html.indexOf('id="waitOverlay"')>html.indexOf('id="updateModal"'));
 assert.match(css,/\.wait-overlay\{[^}]*position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:transparent/);
 assert.ok(app.includes("panel.inert=locked"));assert.ok(app.includes("document.querySelector('.app').inert=locked||!storageReady"));
 assert.ok(app.includes("manual?waitTasks.begin"));assert.ok(mys.includes("{wait:false}"));
 assert.ok(app.includes("if(ok===null)return;await withWait('import'"));
 assert.ok(app.includes("withWait('startup'"));assert.ok(app.includes("withWait('profiles'"));
 const data=readFileSync(new URL('../wwwroot/icons/loading-dot.png',import.meta.url));
 assert.equal(createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex'),'8b7f3a292b71d6948e3435a657c59482bd0a7d38');
});
