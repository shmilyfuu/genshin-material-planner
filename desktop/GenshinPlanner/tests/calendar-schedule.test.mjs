import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMAIN_SERIES,weeklyMaterialDay,calendarForEntries} from '../wwwroot/calendar-days.mjs';

const expected={
  talent:[
    ['自由','繁荣','浮世','诤言','公平','角逐','月光','慈爱'],
    ['抗争','勤劳','风雅','巧思','正义','焚燔','乐园','坚忍'],
    ['诗文','黄金','天光','笃行','秩序','纷争','浪迹','荣光']
  ],
  weapon:[
    ['高塔孤王','孤云寒林','远海夷地','谧林涓露','悠古弦音','贡祭炽心','奇巧秘器','苍星军势'],
    ['凛风奔狼','雾海云间','鸣神御灵','绿洲花园','纯圣露滴','谵妄圣主','长夜燧火','藏窖灵浆'],
    ['狮牙斗士','漆黑陨铁','今昔剧画','烈日威权','无垢之海','神合秘烟','终北遗嗣','凛雪帝皇']
  ]
};
test('按 BWIKI 周期表覆盖全部 48 个天赋及武器材料系列',()=>{
  assert.deepEqual(DOMAIN_SERIES,expected);
  for(const [kind,days] of Object.entries(expected)){
    for(const [index,names] of days.entries()){
      assert.equal(names.length,8);
      for(const name of names){
        assert.equal(weeklyMaterialDay(kind==='talent'?'「'+name+'」的哲学':name+'的残件',kind),index+1,name);
      }
    }
  }
  assert.equal(weeklyMaterialDay('高塔之王的遗物','weapon'),1);
  assert.equal(weeklyMaterialDay('神秘烟霭的思绪','weapon'),3);
  assert.equal(weeklyMaterialDay('不明材料','weapon'),null);
});

test('至冬秘境新系列按固定日开放，周日全部显示',()=>{
  const talent=['慈爱','坚忍','荣光'];
  const weapons=['苍星军势','藏窖灵浆','凛雪帝皇'];
  const rows=[];
  const entries=talent.map((name,i)=>{
    const book={id:8100+i,name:'「'+name+'」的教导'};
    const gem={id:9100+i,name:weapons[i]+'的始动'};
    rows.push({id:book.id,count:3,lack:2},{id:gem.id,count:4,lack:1});
    return {characterProfile:{materials:{books:[book]}},weaponProfile:{materials:{weapGems:[gem]}}};
  });
  const result=calendarForEntries(entries,{groups:[{rows}]});
  assert.equal(result.unknown.length,0);
  for(let d=0;d<3;d++){
    assert.equal(result.days[d].length,2);
    assert.equal(result.days[d+3].length,2);
    assert.ok(result.days[d].every(x=>x.highlight===true));
  }
  assert.equal(result.days[6].length,6);
});
