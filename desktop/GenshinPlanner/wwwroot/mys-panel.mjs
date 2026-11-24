import {createMiyousheClient} from './mys-client.mjs';
export function installMiyoushePanel(bridge,options){
  const api=createMiyousheClient(bridge),$=id=>document.getElementById(id);
  const modal=$('mysModal'),account=$('mysAccount'),uid=$('mysUid'),status=$('mysStatus'),qr=$('mysQr');
  let roles=[],ticket='',busy=false,accounts={entries:[]},planningId='';
  const text=value=>{status.textContent=value;};
  function controls(){
    for(const id of ['mysAdd','mysRefresh','mysRemove','mysReadUid','mysPoll','mysSync','mysAccount','mysUid','mysClose'])$(id).disabled=busy;
    for(const id of ['mysRefresh','mysRemove','mysReadUid'])$(id).disabled=busy||!account.value;
    $('mysSync').disabled=busy||!uid.value;
    $('mysPoll').disabled=busy||!ticket;
  }
  function clearRoles(){roles=[];uid.replaceChildren(new Option('请选择 UID',''));controls();}
  function showAccounts(next){
    accounts=next;account.replaceChildren(new Option('请选择米游社账号',''));
    for(const a of accounts.entries)account.add(new Option(a.label+(a.hasCookie?'':' · 待刷新'),a.id));
    account.value=accounts.activeId||'';clearRoles();controls();
  }
  async function action(fn){if(busy)return;busy=true;controls();
    try{await fn();}catch(e){text(String(e.message||e));}finally{busy=false;controls();}
  }
  $('mysOpen').onclick=()=>action(async()=>{
    planningId=options.getPlanningId();modal.hidden=false;
    text('正在读取已保存的账号…');showAccounts(await api.accounts());
    text('选择账号并读取 UID。');
  });
  $('mysClose').onclick=()=>{if(!busy){modal.hidden=true;ticket='';qr.hidden=true;}};
  account.onchange=()=>action(async()=>{if(account.value)showAccounts(await api.switchAccount(account.value));else clearRoles();});
  $('mysAdd').onclick=()=>action(async()=>{
    text('正在生成米游社登录二维码…');const result=await api.startQr();ticket=result.ticket;
    const code=globalThis.qrcode(0,'M');code.addData(result.url,'Byte');code.make();
    $('mysQrImage').src=code.createDataURL(5,12);qr.hidden=false;text('使用米游社扫码确认后，点击检查扫码状态。');
  });
  $('mysPoll').onclick=()=>action(async()=>{
    const result=await api.pollQr(ticket);
    if(result.status==='Confirmed'){ticket='';qr.hidden=true;showAccounts(result.accounts);text(result.warning||'登录完成，请读取 UID。');}
    else text(({Init:'等待扫码。',Scanned:'已扫码，等待确认。',Expired:'二维码已过期。'})[result.status]||result.status);
  });
  $('mysRefresh').onclick=()=>action(async()=>{showAccounts(await api.refresh(account.value));text('凭证已刷新。');});
  $('mysRemove').onclick=()=>action(async()=>{if(window.confirm('移除此账号的本地登录凭证？')){showAccounts(await api.remove(account.value));text('账号已移除。');}});
  $('mysReadUid').onclick=()=>action(async()=>{
    text('正在读取国服 UID…');roles=await api.roles();
    uid.replaceChildren(new Option('请选择 UID',''));
    for(const r of roles)uid.add(new Option((r.nickname||'旅行者')+' · '+r.uid+' · '+r.regionName,r.uid+'|'+r.region));
    const preferred=roles.find(r=>r.uid===options.getInventoryUid());
    if(preferred||roles.length===1){const r=preferred||roles[0];uid.value=r.uid+'|'+r.region;}
    text(roles.length?'请选择需要同步的 UID。':'此账号没有国服原神角色。');
  });
  uid.onchange=controls;
  $('mysSync').onclick=()=>action(async()=>{
    const role=roles.find(r=>r.uid+'|'+r.region===uid.value);
    if(!role)throw Error('请选择 UID。');
    if(options.getPlanningId()!==planningId)throw Error('规划账号已切换，请重新打开米游社。');
    const existing=options.getInventoryUid();
    if(existing&&existing!==role.uid)throw Error('该 UID 与当前规划账号不同，请切换规划账号。');
    const result=await api.syncInventory(role.uid,role.region,text);
    if(options.getPlanningId()!==planningId|| (options.getInventoryUid()&&options.getInventoryUid()!==role.uid))throw Error('查询期间规划账号发生变化。');
    options.apply(result);
    const min=result.materials.filter(m=>m.minimum).length;
    text(`同步背包已更新 · ${result.characterCount} 名角色 / ${result.weaponCount} 类武器 / ${result.materials.length} 种材料 · ${min} 种达到探测上限。`);
  });
  controls();
}
