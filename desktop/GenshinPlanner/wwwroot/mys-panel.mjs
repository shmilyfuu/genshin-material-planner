import {createMiyousheClient} from './mys-client.mjs';
import {sameMysBinding} from './mys-binding.mjs';
export function installMiyoushePanel(bridge,options){
  const api=createMiyousheClient(bridge),$=id=>document.getElementById(id);
  const modal=$('mysModal'),account=$('mysAccount'),uid=$('mysUid'),status=$('mysStatus'),qr=$('mysQr'),target=$('mysBindingTarget'),name=$('mysNewName');
  let roles=[],ticket='',busy=false,pollTimer=null;
  const text=value=>{status.textContent=value;};
  const selectedRole=()=>roles.find(r=>r.uid+'|'+r.region===uid.value);
  function controls(){
    for(const id of ['mysAdd','mysRefresh','mysRemove','mysDiagnose','mysAccount','mysUid','mysBindingTarget','mysNewName','mysBind','mysUnbind','mysClose'])$(id).disabled=busy;
    $('mysRefresh').disabled=busy||!account.value;$('mysRemove').disabled=busy||!account.value;
    $('mysBind').disabled=busy||!account.value||!selectedRole()||!target.value;
    $('mysDiagnose').disabled=busy||!account.value||!selectedRole();
    $('mysUnbind').disabled=busy||!options.getBinding();
    const top=$('syncInventoryButton'),binding=options.getBinding();
    top.disabled=busy;top.title=binding?'同步 UID '+binding.uid:'绑定米游社账号后同步库存';
    for(const id of ['accountSelect','addAccountButton','renameAccountButton','deleteAccountButton','importButton','importGoodButton','refreshButton','mysOpen'])$(id).disabled=busy||(id==='deleteAccountButton'&&options.listPlanning().length<=1);
    $('mysCurrentBinding').textContent=binding?'当前规划账号已绑定：'+(binding.nickname?binding.nickname+' · ':'')+'UID '+binding.uid:'当前规划账号尚未绑定米游社。';
  }
  function stopPoll(){clearTimeout(pollTimer);pollTimer=null;ticket='';qr.hidden=true;}
  function clearRoles(){roles=[];uid.replaceChildren(new Option('请选择 UID',''));target.replaceChildren(new Option('请选择绑定账号',''));$('mysNewNameField').hidden=true;controls();}
  function showAccounts(next,preferred=''){
    account.replaceChildren(new Option('请选择米游社账号',''));
    for(const a of next.entries)account.add(new Option(a.label+(a.hasCookie?'':' · 待刷新'),a.id));
    account.value=next.entries.some(a=>a.id===preferred)?preferred:next.activeId||next.entries[0]?.id||'';
    clearRoles();
  }
  function showTargets(){
    const role=selectedRole(),planning=options.listPlanning(),current=options.getPlanningId(),prior=target.value;
    target.replaceChildren(new Option('请选择绑定账号',''));
    if(!role){$('mysNewNameField').hidden=true;controls();return;}
    const existing=planning.find(a=>a.uid===role.uid);
    for(const a of planning){
      const o=new Option(a.name+(a.uid?' · UID '+a.uid:''),a.id);
      o.disabled=!!existing&&existing.id!==a.id;target.add(o);
    }
    const add=new Option('新建规划账号','@new');add.disabled=!!existing;target.add(add);
    target.value=existing?.id||(planning.some(a=>a.id===prior)?prior:current);
    if(!target.value)target.value='@new';
    updateTarget();
  }
  function updateTarget(){
    $('mysNewNameField').hidden=target.value!=='@new';
    if(target.value==='@new')name.value=(selectedRole()?.nickname||selectedRole()?.uid||'').slice(0,32);
    controls();
  }
  async function loadRoles(){
    clearRoles();if(!account.value){text('添加或选择已登录的米游社账号。');return;}
    text('正在读取国服 UID…');roles=await api.roles(account.value);
    for(const r of roles)uid.add(new Option((r.nickname||'旅行者')+' · '+r.uid+' · '+r.regionName,r.uid+'|'+r.region));
    const preferred=roles.find(r=>r.uid===options.getInventoryUid());
    if(preferred||roles.length===1){const r=preferred||roles[0];uid.value=r.uid+'|'+r.region;}
    showTargets();text(roles.length?'选择 UID 与规划账号，确认绑定。':'此账号没有国服原神角色。');
  }
  async function action(fn,{header=false}={}){
    if(busy)return;busy=true;controls();
    try{await fn();}catch(e){
      const message=String(e.message||e);
      if(header){options.setStatus(message,'error');options.toast(message);if(!modal.hidden)text(message);}
      else text(message);
    }finally{busy=false;controls();}
  }
  async function open(){
    modal.hidden=false;stopPoll();text('正在读取已保存的账号…');
    showAccounts(await api.accounts(),options.getBinding()?.accountId||'');
    if(account.value)await loadRoles();else text('扫码登录米游社，选择 UID 后绑定规划账号。');
  }
  $('mysOpen').onclick=()=>action(open);
  $('mysClose').onclick=()=>{if(!busy){stopPoll();modal.hidden=true;}};
  account.onchange=()=>action(async()=>{stopPoll();await loadRoles();});
  function schedulePoll(){
    if(!ticket||modal.hidden)return;
    pollTimer=setTimeout(()=>{
      if(busy){schedulePoll();return;}
      void action(async()=>{
        const current=ticket;
        try{
          const result=await api.pollQr(current);
          if(ticket!==current)return;
          if(result.status==='Confirmed'){
            stopPoll();showAccounts(result.accounts,result.accounts.activeId);await loadRoles();
          }else if(result.status==='Expired'){stopPoll();text('二维码已过期，请重新扫码。');}
          else{text(result.status==='Scanned'?'已扫码，等待确认。':'使用米游社扫码确认。');schedulePoll();}
        }catch(e){stopPoll();throw e;}
      });
    },1500);
  }
  $('mysAdd').onclick=()=>action(async()=>{
    stopPoll();clearRoles();text('正在生成米游社登录二维码…');
    const result=await api.startQr();ticket=result.ticket;
    const code=globalThis.qrcode(0,'M');code.addData(result.url,'Byte');code.make();
    $('mysQrImage').src=code.createDataURL(5,12);qr.hidden=false;text('使用米游社扫码确认。');schedulePoll();
  });
  $('mysRefresh').onclick=()=>action(async()=>{stopPoll();const id=account.value;showAccounts(await api.refresh(id),id);await loadRoles();});
  $('mysRemove').onclick=()=>action(async()=>{
    if(!window.confirm('移除此米游社账号的本地登录记录？相关规划账号需要重新登录后才能同步。'))return;
    stopPoll();showAccounts(await api.remove(account.value));await loadRoles();
  });
  uid.onchange=showTargets;target.onchange=updateTarget;
  $('mysBind').onclick=()=>action(async()=>{
    stopPoll();const role=selectedRole();if(!role||!account.value||!target.value)throw Error('请选择 UID 与规划账号。');
    const changed=await options.bind(target.value,{accountId:account.value,...role},name.value);
    if(changed){modal.hidden=true;options.toast('米游社账号已绑定 · UID '+role.uid);}
  });
  $('mysUnbind').onclick=()=>action(async()=>{
    if(!options.getBinding())return;
    if(!window.confirm('解除当前规划账号的米游社绑定？已有规划与库存将保留。'))return;
    await options.unbind();text('当前规划账号已解除绑定。');
  });
  $('syncInventoryButton').onclick=()=>action(async()=>{
    const binding=options.getBinding();
    if(!binding){await open();return;}
    const planningId=options.getPlanningId();
    const progress=value=>options.setStatus(value);
    progress('正在同步 UID '+binding.uid+' 的库存…');
    try{
      const result=await api.syncInventory(binding.accountId,binding.uid,binding.region,progress,options.loadInventoryProfile);
      if(options.getPlanningId()!==planningId||!sameMysBinding(binding,options.getBinding()))throw Error('查询期间规划账号或绑定发生变化。');
      await options.apply(result);
      const min=result.materials.filter(m=>m.minimum).length;
      const summary=`库存已同步 · ${result.materials.length-min} 种确定 / ${min} 种下限 / ${result.unresolved.length} 种未知`;
      options.setStatus(summary,'success');options.toast(summary);
    }catch(e){
      if(/本地登录记录缺失|长期凭证|旧版凭证|接口错误 -(?:100|101)\b|登录失效|登录过期|未登录/.test(String(e.message))){
        await open().catch(()=>{});text('请重新扫码或刷新登录记录。');
      }
      throw e;
    }
  },{header:true});
  $('mysDiagnose').onclick=()=>action(async()=>{
    stopPoll();const role=selectedRole();
    if(!role||!account.value)throw Error('请选择米游社账号与 UID。');
    const report=await api.diagnoseInventory(account.value,role.uid,role.region,text,options.loadDiagnosticWeapon);
    await bridge('mys.diagnostics.save',{report});
    text(`诊断已保存至 data/inventory-diagnostics.json · 有效响应 ${report.successfulCases}/${report.cases.length}${report.error?' · '+report.error:''}`);
  });
  controls();return {update:controls,isBusy:()=>busy};
}
