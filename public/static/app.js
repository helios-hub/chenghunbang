let SHOPS=[],SCENES=[],PLANS=[],RANKINGS=[],memberCount=0,freeCount=0;
const S={user:null,memberUntil:0,favShops:new Set(),favRanks:new Set(),payMode:'off',ready:false,
  feedCat:'all',feedScene:null,rTab:'free',rCat:'all',plan:'q',agreeMember:false,authMode:'login',agreeReg:false};
const isMember=()=>S.memberUntil>Date.now();
const shop=id=>SHOPS.find(s=>s.id===id);
const rank=id=>RANKINGS.find(r=>r.id===id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=t=>{const d=new Date(t);return `${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日`};
const go=h=>{location.hash=h};

async function api(method,path,body){
  if(window.__DEMO_API__)return window.__DEMO_API__(method,path,body);
  let res;
  try{res=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined})}
  catch{throw new Error('网络连接失败，请稍后再试')}
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Object.assign(new Error(data.error||'请求失败'),{status:res.status});
  return data;
}
function applySession(d){
  S.user=d.user?{phone:d.user.phone,nick:d.user.nick}:null;
  S.memberUntil=d.user?d.user.memberUntil:0;
  S.favShops=new Set(d.favorites?d.favorites.shops:[]);
  S.favRanks=new Set(d.favorites?d.favorites.ranks:[]);
}
async function loadContent(){
  const c=await api('GET','/api/content');
  ({shops:SHOPS,scenes:SCENES,plans:PLANS,rankings:RANKINGS}=c);
  S.payMode=c.payMode;
  memberCount=RANKINGS.filter(r=>r.access==='member').length;
  freeCount=RANKINGS.length-memberCount;
}
let toastTimer;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1800)}
const notice=`<p class="notice">适量饮酒，未满 18 周岁请勿饮酒</p>`;
const crumbs=(...p)=>`<nav class="crumbs" aria-label="面包屑">${p.map(([t,h])=>h?`<a href="${h}">${esc(t)}</a>`:esc(t)).join('<span>/</span>')}</nav>`;

function header(active){
  const here=location.hash.startsWith('#/login')?'#/':(location.hash||'#/');
  const nx=encodeURIComponent(here);
  const nav=[['#/','发现','feed'],['#/rankings','榜单','rankings']].map(([h,t,k])=>`<a href="${h}" ${active===k?'aria-current="page"':''}>${t}</a>`).join('');
  const user=S.user
    ?`<a class="who" href="#/me" ${active==='me'?'aria-current="page"':''}>${isMember()?'<span class="vip">会员</span>':''}${esc(S.user.nick)}</a>`
    :`<button class="btn ghost" data-mode="login" data-go="#/login?next=${nx}">登录</button><button class="btn" data-mode="register" data-go="#/login?next=${nx}">注册</button>`;
  return `<header class="site-header"><div class="wrap"><a class="brand" href="#/">晨昏榜<small>上海咖啡厅和酒吧</small></a><nav class="nav" aria-label="主导航">${nav}</nav><div class="user-area">${user}</div></div></header>`;
}
const footer=`<footer class="site-footer"><div class="wrap"><div><b>晨昏榜</b><p>按场景挑店，不用在评论里大海捞针。</p></div><div><p>演示站点，店铺与数据均为虚构</p><p>适量饮酒，未满 18 周岁请勿饮酒</p></div></div></footer>`;
const shell=(active,inner)=>`${header(active)}<main id="main"><div class="wrap">${inner}</div></main>${footer}`;

function ranksOf(id){return RANKINGS.map(r=>({r,pos:r.items.findIndex(i=>i&&i[0]===id)+1})).filter(x=>x.pos>0)}
function rankLine(id){
  const all=ranksOf(id),free=all.filter(x=>x.r.access==='free'),mem=all.filter(x=>x.r.access==='member');
  const parts=[];
  if(free.length)parts.push(`${free[0].r.short}第 ${free[0].pos} 名`);
  if(isMember()){if(mem.length)parts.push(`${mem[0].r.short}第 ${mem[0].pos} 名`)}
  else if(shop(id).memberRankCount)parts.push(`还入选了 ${shop(id).memberRankCount} 个会员榜单`);
  return parts.length?`<span class="rankline">${parts.join('，')}</span>`:'';
}
function shopCard(s){
  return `<a class="shop" href="#/shop/${s.id}"><div class="cover ${s.cover}" role="img" aria-label="${esc(s.name)}封面"></div><div class="body">
    <h3>${esc(s.name)}</h3><div class="meta"><span class="star">${s.star}</span> 人均 ¥${s.price}，${s.area}，${s.sub}</div>
    <div class="tags">${s.tags.slice(0,3).map(t=>`<span class="tag ${s.cat==='bar'?'n':''}">${esc(t)}</span>`).join('')}</div>${rankLine(s.id)}</div></a>`;
}
function rankCard(r){
  const locked=r.access==='member'&&!isMember();
  const rows=r.items.slice(0,3).map((it,i)=>!it
    ?`<li class="locked"><b>${i+1}</b><span class="blur" style="width:${[0,120,90][i]}px" aria-label="会员可见"></span></li>`
    :`<li><b>${i+1}</b>${esc(shop(it[0]).name)}</li>`).join('');
  return `<a class="ranking ${r.access==='member'?'member':''}" href="#/ranking/${r.id}">
    <div class="k">${r.access==='member'?'<span class="vip">会员</span>&nbsp; ':''}榜单，${r.items.length} 家上榜</div>
    <h3>${esc(r.title)}</h3>${r.access==='member'?`<p class="note">${esc(r.note)}</p>`:''}<ol>${rows}</ol>
    <div class="more">${locked?'开通会员看完整榜单':esc(r.rule)}</div></a>`;
}
const CATS=[['all','全部'],['coffee','咖啡'],['bar','酒吧']];
const catSeg=(attr,cur)=>`<div class="seg" role="group" aria-label="品类">${CATS.map(([k,t])=>`<button ${attr}="${k}" aria-pressed="${cur===k}">${t}</button>`).join('')}</div>`;

function viewFeed(){
  let list=SHOPS.filter(s=>S.feedCat==='all'||s.cat===S.feedCat);
  if(S.feedScene)list=list.filter(s=>s.scenes[S.feedScene]).sort((a,b)=>b.scenes[S.feedScene]-a.scenes[S.feedScene]);
  else list=[...list].sort((a,b)=>b.star-a.star);
  const ranks=RANKINGS.filter(r=>S.feedCat==='all'||r.cat==='all'||r.cat===S.feedCat).slice(0,3);
  const hero=isMember()?'':`<section class="hero-band"><div><h1>按场景挑店，不在评论里大海捞针</h1><p>约会、办公、一个人、深夜，每个场景都有榜单。会员可以看按区域和条件细分的 ${memberCount} 个榜单。</p></div>
    <div class="btns"><button class="btn gold lg" data-go="#/member">开通会员</button><a class="btn ghost lg" href="#/rankings">看全部榜单</a></div></section>`;
  const body=list.length
    ?`<div class="grid c3">${list.map(shopCard).join('')}</div>`
    :`<div class="empty"><b>没有符合的店</b>换个场景试试<br><button class="btn" data-act="clear">清除筛选</button></div>`;
  return shell('feed',`${hero}
    <div class="sec-head"><h2>热门榜单</h2><a href="#/rankings">全部榜单</a></div>
    <div class="grid c3">${ranks.map(rankCard).join('')}</div>
    <div class="sec-head" style="margin-bottom:0"><h2>全部店铺</h2></div>
    <div class="toolbar">${catSeg('data-cat',S.feedCat)}
      <div class="chips" role="group" aria-label="场景">${SCENES.map(([k,t])=>`<button class="chip ${S.feedScene===k?'on':''}" data-scene="${k}" aria-pressed="${S.feedScene===k}">${t}</button>`).join('')}</div></div>
    <div style="margin-top:16px">${body}</div>${S.feedCat!=='coffee'?notice:''}`);
}

function viewRankings(){
  const list=RANKINGS.filter(r=>r.access===S.rTab&&(S.rCat==='all'||r.cat===S.rCat||r.cat==='all'));
  return shell('rankings',`<h1 class="page-title">榜单</h1><p class="lead">每个榜单都写明了排序规则。会员榜单按区域和多个条件细分，每月更新。</p>
    <div class="toolbar" style="margin-top:0"><div class="seg" role="tablist"><button role="tab" data-rtab="free" aria-selected="${S.rTab==='free'}">免费榜单 ${freeCount}</button><button role="tab" data-rtab="member" aria-selected="${S.rTab==='member'}">会员榜单 ${memberCount}</button></div>${catSeg('data-rcat',S.rCat)}</div>
    ${S.rTab==='member'&&!isMember()?`<div class="perk" style="margin:0 0 20px"><div><b>${memberCount} 个会员榜单</b>按区域、多条件细分，每月更新</div><button class="btn" data-go="#/member">¥12 起开通</button></div>`:''}
    ${list.length?`<div class="grid c3">${list.map(rankCard).join('')}</div>`:'<div class="empty"><b>这个品类暂时没有榜单</b></div>'}`);
}
function viewMissing(){
  return shell('',`<div class="empty"><b>内容不存在</b>可能已经下架了<br><a class="btn" href="#/">回到首页</a></div>`);
}

function viewRanking(id){
  const r=rank(id);if(!r)return viewMissing();
  const locked=r.access==='member'&&!isMember();
  const items=r.items.map((it,i)=>{
    if(!it)return `<div class="item locked" aria-label="第 ${i+1} 名，开通会员后可见"><span class="no">${i+1}</span><div class="cover"></div><div style="flex:1"><span class="bar" style="width:40%"></span><span class="bar" style="width:75%"></span></div></div>`;
    const [sid,why]=it,s=shop(sid);
    return `<a class="item" href="#/shop/${s.id}"><span class="no">${i+1}</span><div class="cover ${s.cover}"></div><div>
      <h3>${esc(s.name)}</h3><div class="meta"><span class="star">${s.star}</span> 人均 ¥${s.price}，${s.area}</div><div class="why">${esc(why)}</div></div></a>`;
  }).join('');
  const fav=S.favRanks.has(r.id);
  const side=locked
    ?`<div class="panel"><h3>开通会员，看完这份榜单</h3><p>还有 ${r.items.length-1} 家店。会员可以看全部 ${memberCount} 个会员榜单，每月更新。</p>
      <button class="btn block lg" data-go="#/member?next=${encodeURIComponent('#/ranking/'+r.id)}">¥12 开通月卡</button><small>也有季卡 ¥30、年卡 ¥98，不自动续费</small></div>`
    :`<div class="panel"><h3>榜单操作</h3><div class="row"><button class="btn" data-favrank="${r.id}">${fav?'已收藏':'收藏榜单'}</button><button class="btn ghost" data-act="share">分享</button></div></div>`;
  return shell('rankings',`${crumbs(['榜单','#/rankings'],[r.title])}
    <section class="r-band ${r.access==='free'?'free':''}">${r.access==='member'?'<span class="vip">会员</span>':''}<h1>${esc(r.title)}</h1><p>${esc(r.note)}，共 ${r.items.length} 家。</p><div class="rule">${esc(r.rule)}</div></section>
    <div class="two-col"><div>${items}</div><aside class="side">${side}</aside></div>${r.cat!=='coffee'?notice:''}`);
}

function viewShop(id){
  const s=shop(id);if(!s)return viewMissing();
  const sceneName=Object.fromEntries(SCENES);
  const meters=Object.entries(s.scenes).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="meter"><span>${sceneName[k]}</span><span class="bar"><i style="width:${v/5*100}%;${s.cat==='coffee'?'background:var(--wt)':''}"></i></span><b>${v}</b></div>`).join('');
  const all=ranksOf(s.id),free=all.filter(x=>x.r.access==='free'),mem=all.filter(x=>x.r.access==='member');
  let rk=(isMember()?all:free).map(x=>`<a class="rankline" href="#/ranking/${x.r.id}">${esc(x.r.title)} 第 ${x.pos} 名</a>`).join('');
  if(!isMember()&&s.memberRankCount)rk+=`<div class="lockrow"><span><span class="vip">会员</span>&nbsp; 还入选了 ${s.memberRankCount} 个会员榜单</span><button class="btn gold" data-go="#/member?next=${encodeURIComponent('#/shop/'+s.id)}">开通查看</button></div>`;
  const fav=S.favShops.has(s.id);
  return shell('feed',`${crumbs(['发现','#/'],[s.name])}
    <div class="cover s-hero ${s.cover}" role="img" aria-label="${esc(s.name)}封面"></div>
    <div class="s-title"><h1>${esc(s.name)}</h1><span class="open">营业中，${s.open}</span></div>
    <div class="meta" style="margin:0"><span class="star">${s.star}</span>（${s.reviews} 条评论）</div>
    <div class="two-col" style="margin-top:8px"><div>
      <p class="oneline">${esc(s.one)}</p>
      <div class="card"><h4>适合</h4>${meters}<p class="nope">不太适合：${esc(s.nope)}</p></div>
      <div class="card"><h4>去之前知道</h4><ul class="pain">${s.pains.map(([t,n])=>`<li>${esc(t)}<small>${n} 条评论提到</small></li>`).join('')}</ul></div>
      <div class="card"><h4>环境</h4><div class="env">${s.env.map(([k,v])=>`<div>${esc(k)}<b>${esc(v)}</b></div>`).join('')}</div></div>
    </div><aside class="side">
      <div class="panel"><h3>基本信息</h3><ul class="facts"><li><span>人均</span>¥${s.price}</li><li><span>区域</span>${s.area}</li><li><span>类型</span>${s.sub}</li><li><span>营业</span>${s.open}</li></ul>
        <div class="row"><button class="btn" data-favshop="${s.id}">${fav?'已收藏':'收藏'}</button><button class="btn ghost" data-act="share">分享</button></div></div>
      ${rk?`<div class="panel"><h3>入选榜单</h3>${rk}</div>`:''}
    </aside></div>${s.cat==='bar'?notice:''}`);
}
function viewMember(next){
  const p=PLANS.find(x=>x.id===S.plan);
  const plans=PLANS.map(x=>`<button class="plan ${x.id===S.plan?'on':''}" role="radio" aria-checked="${x.id===S.plan}" data-plan="${x.id}">
    <b>${x.name}</b><span class="p">¥${x.price}</span><span class="meta">${x.days} 天${x.days>30?`，约 ¥${Math.round(x.price/x.days*30)} / 月`:''}</span></button>`).join('');
  return shell('',`<div class="narrow">${crumbs(['发现','#/'],['开通会员'])}
    ${isMember()?`<div class="demo-note" style="margin:0 0 16px">你已是会员，有效期到 ${fmtDate(S.memberUntil)}。再次购买会顺延。</div>`:''}
    <h1 class="page-title" style="margin-top:8px">看全部 ${memberCount} 个会员榜单</h1>
    <ul class="perks"><li>按区域、多条件细分的榜单，比如「静安寺周边办公咖啡」</li><li>评论少但口碑好的小店</li><li>店卡和店详情上显示会员榜单名次</li><li>每月更新，新榜单会员先看</li></ul>
    <div class="plans" role="radiogroup" aria-label="选择套餐">${plans}</div>
    <p class="meta" style="margin-top:16px">一次性购买，到期不自动续费。7 天内没看过会员榜单可以申请退款。</p>
    <div class="buy"><button class="btn lg" data-act="pay" data-next="${esc(next||'#/me')}">支付 ¥${p.price}，开通${p.name}</button>
      <label class="agree"><input type="checkbox" data-agree="member" ${S.agreeMember?'checked':''}>我已阅读并同意《会员服务协议》</label></div>
    ${S.payMode==='mock'?'<div class="demo-note">模拟支付环境，点击后不会真实扣款</div>':S.payMode==='off'?'<div class="demo-note">支付渠道尚未开通，暂时无法购买会员</div>':''}</div>`);
}

function viewLogin(next){
  const reg=S.authMode==='register';
  return shell('',`<div class="auth"><h1>${reg?'注册晨昏榜':'登录晨昏榜'}</h1>
  <p class="meta">登录后可以收藏、开通会员</p>
  <form data-next="${esc(next||'#/me')}" novalidate>
    <label>手机号<input type="tel" name="phone" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="11 位手机号"></label>
    <label>密码<input type="password" name="pwd" maxlength="20" autocomplete="${reg?'new-password':'current-password'}" placeholder="8-20 位，包含字母和数字"></label>
    ${reg?`<label>确认密码<input type="password" name="pwd2" maxlength="20" autocomplete="new-password"></label>
    <label class="agree"><input type="checkbox" data-agree="reg" ${S.agreeReg?'checked':''}>同意《用户协议》《隐私政策》，且已满 18 周岁</label>`:''}
    <div class="err" role="alert"></div>
    <button class="btn block lg" type="submit">${reg?'注册并登录':'登录'}</button>
  </form>
  <p class="switch">${reg?'已有账号？<a href="#" data-act="mode">去登录</a>':'还没有账号？<a href="#" data-act="mode">去注册</a>'}</p>
  </div>`);
}

function viewMe(){
  if(!S.user)return shell('me',`<div class="empty"><b>登录后可以收藏和开通会员</b>浏览店和免费榜单不需要登录<br><button class="btn" data-mode="login" data-go="#/login?next=%23%2Fme">登录 / 注册</button></div>`);
  const phone=S.user.phone.replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2');
  const fs=[...S.favShops].map(shop),fr=[...S.favRanks].map(rank);
  const favs=fs.length+fr.length?[...fs.map(s=>`<a class="mini" href="#/shop/${s.id}"><span class="cover ${s.cover}"></span>${esc(s.name)}<small>店</small></a>`),
    ...fr.map(r=>`<a class="mini" href="#/ranking/${r.id}"><span class="cover ${r.access==='member'?'c-bar2':'c-coffee'}"></span>${esc(r.title)}<small>榜单</small></a>`)].join('')
    :'<p class="meta" style="margin:0">还没有收藏。逛到喜欢的店或榜单，点「收藏」就会出现在这里。</p>';
  return shell('me',`<div class="me-head"><span class="avatar" aria-hidden="true">晨</span><div><h1 class="page-title" style="margin:0;font-size:24px">${esc(S.user.nick)}</h1><div class="meta" style="margin:0">${phone}</div></div></div>
    <div class="two-col"><div class="panel"><h3>我的收藏</h3>${favs}</div>
    <aside class="side"><div class="mecard"><b>${isMember()?'晨昏榜会员':'还不是会员'}</b><span>${isMember()?`有效期到 ${fmtDate(S.memberUntil)}`:`开通后可看 ${memberCount} 个会员榜单`}</span><button class="btn gold" data-go="#/member">${isMember()?'续费':'开通会员'}</button></div>
    <div class="panel menu"><button data-act="soon">修改资料<small>暂未开放</small></button><button data-act="soon">用户协议与隐私政策</button><button data-act="logout">退出登录</button></div></aside></div>`);
}
const app=document.getElementById('app');
function parse(){const h=location.hash||'#/';const [p,q]=h.slice(1).split('?');return {path:p.split('/').filter(Boolean),q:new URLSearchParams(q||''),hash:h}}
function render(keepScroll){
  const {path,q,hash}=parse();
  if(path[0]==='member'&&!S.user){location.replace('#/login?next='+encodeURIComponent(hash));return}
  const y=window.scrollY;
  let html;
  switch(path[0]){
    case undefined:html=viewFeed();document.title='晨昏榜 · 上海咖啡厅和酒吧';break;
    case 'rankings':html=viewRankings();document.title='榜单 · 晨昏榜';break;
    case 'ranking':html=viewRanking(path[1]);document.title=(rank(path[1])?.title||'榜单')+' · 晨昏榜';break;
    case 'shop':html=viewShop(path[1]);document.title=(shop(path[1])?.name||'店')+' · 晨昏榜';break;
    case 'member':html=viewMember(q.get('next'));document.title='开通会员 · 晨昏榜';break;
    case 'login':html=viewLogin(q.get('next'));document.title='登录 · 晨昏榜';break;
    case 'me':html=viewMe();document.title='我的 · 晨昏榜';break;
    default:html=viewMissing();document.title='内容不存在 · 晨昏榜';
  }
  app.innerHTML=html;
  window.scrollTo(0,keepScroll?y:0);
}
const leave=next=>location.replace(next);

async function resync(){
  const me=await api('GET','/api/me');
  applySession(me);
  await loadContent();
}
function sessionExpired(){
  applySession({user:null});
  loadContent().catch(()=>{}).finally(()=>{toast('登录已过期，请重新登录');location.replace('#/login?next='+encodeURIComponent(location.hash))});
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-go],[data-act],[data-cat],[data-scene],[data-rtab],[data-rcat],[data-plan],[data-favshop],[data-favrank]');
  if(!t)return;
  const d=t.dataset;
  if(d.mode)S.authMode=d.mode;
  if(d.go){e.preventDefault();go(d.go);return}
  if(d.cat){S.feedCat=d.cat;render(true);return}
  if(d.scene){S.feedScene=S.feedScene===d.scene?null:d.scene;render(true);return}
  if(d.rtab){S.rTab=d.rtab;render(true);return}
  if(d.rcat){S.rCat=d.rcat;render(true);return}
  if(d.plan){S.plan=d.plan;render(true);return}
  if(d.favshop||d.favrank){
    if(!S.user){S.authMode='login';go('#/login?next='+encodeURIComponent(location.hash));return}
    const kind=d.favshop?'shop':'rank',id=d.favshop||d.favrank;
    const had=(kind==='shop'?S.favShops:S.favRanks).has(id);
    try{
      const r=await api('POST','/api/favorites',{kind,id});
      S.favShops=new Set(r.favorites.shops);S.favRanks=new Set(r.favorites.ranks);
      toast(had?'已取消收藏':'已收藏');render(true);
    }catch(err){err.status===401?sessionExpired():toast(err.message)}
    return}
  switch(d.act){
    case 'clear':S.feedCat='all';S.feedScene=null;render(true);break;
    case 'reload':location.reload();break;
    case 'share':navigator.clipboard?.writeText(location.href).then(()=>toast('链接已复制'),()=>toast('请手动复制地址栏链接'))||toast('请手动复制地址栏链接');break;
    case 'soon':toast('暂未开放');break;
    case 'logout':
      try{await api('POST','/api/logout',{})}catch{}
      applySession({user:null});
      try{await loadContent()}catch{}
      toast('已退出登录');go('#/');render(false);break;
    case 'mode':e.preventDefault();S.authMode=S.authMode==='login'?'register':'login';render(true);break;
    case 'pay':{
      if(!S.agreeMember){toast('请先同意《会员服务协议》');break}
      if(S.payMode!=='mock'){toast('支付渠道尚未开通');break}
      const p=PLANS.find(x=>x.id===S.plan),next=d.next;
      t.disabled=true;t.innerHTML='<span class="paying"><span class="spin"></span>正在确认支付结果</span>';
      try{
        const o=await api('POST','/api/orders',{planId:p.id});
        applySession(await api('POST','/api/orders/pay-mock',{orderId:o.order.id}));
        await loadContent();
        toast(`已开通${p.name}，会员榜单已解锁`);leave(next);
      }catch(err){
        if(err.status===401){sessionExpired();break}
        toast(err.message);render(true);
      }
      break}
  }
});
document.addEventListener('change',e=>{
  if(e.target.dataset.agree==='member')S.agreeMember=e.target.checked;
  if(e.target.dataset.agree==='reg')S.agreeReg=e.target.checked;
});
document.addEventListener('submit',async e=>{
  const f=e.target.closest('.auth form');if(!f)return;e.preventDefault();
  const err=f.querySelector('.err'),btn=f.querySelector('button[type=submit]');
  const phone=f.elements.phone.value.trim(),pwd=f.elements.pwd.value,reg=S.authMode==='register';
  if(!/^1[3-9]\d{9}$/.test(phone)){err.textContent='请输入 11 位中国大陆手机号';return}
  if(reg){
    if(!/^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(pwd)){err.textContent='密码需要 8-20 位，同时包含字母和数字';return}
    if(pwd!==f.elements.pwd2.value){err.textContent='两次输入的密码不一致';return}
    if(!S.agreeReg){err.textContent='请先勾选同意协议，并确认已满 18 周岁';return}
  }else if(!pwd){err.textContent='请输入密码';return}
  err.textContent='';btn.disabled=true;
  try{
    applySession(await api('POST',reg?'/api/register':'/api/login',reg?{phone,password:pwd,agree:true}:{phone,password:pwd}));
    await loadContent();
    toast(reg?'注册成功，已登录':'已登录');
    leave(f.dataset.next||'#/');
  }catch(ex){err.textContent=ex.message;btn.disabled=false}
});
window.addEventListener('hashchange',()=>{if(S.ready)render(false)});

async function init(){
  app.innerHTML='<p style="padding:64px 24px;text-align:center;color:#66706B">加载中…</p>';
  try{
    await resync();
    S.ready=true;render(false);
  }catch(ex){
    app.innerHTML=`<div class="empty"><b>加载失败</b>${esc(ex.message)}<br><button class="btn" data-act="reload">重试</button></div>`;
  }
}
init();
