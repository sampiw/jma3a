"use client";

import { useEffect, useRef, useState } from "react";
import type { Simsar3DGameViewProps } from "../Simsar3DGameView";
import type { SimsarState, SimsarAction } from "@/games/simsar3d/types";
import { MOUL_CAST, MOUL_DISTRICTS, MOUL_SITES, districtCount, moulRent, rarity, routeTile, upgradePrice, type MoulShot } from "@/games/simsar3d/moulBoard";
import { SimsarMiniGames } from "./SimsarMiniGames";
import { simsarSfx } from "./soundFx";
import MoulDiorama from "./MoulDiorama";
import css from "./MoulGame.module.css";

export default function MoulGame({publicData, privateData, activePlayerId, devicePlayers, onAction, isHost, roomCode}: Simsar3DGameViewProps) {
  const s = publicData as SimsarState, m = s.moul!;
  const active = s.players[s.currentPlayerId];
  const localIds = devicePlayers?.map(p => p.id) ?? [];
  const defaultId = activePlayerId || privateData?.myPlayerId || localIds[0];
  const localAuctionId = localIds.find(id => !(id in m.bids));
  const localMiniId = localIds.find(id => !s.miniGame?.submittedIds.includes(id));
  const myId = (s.phase === "AUCTION" && localAuctionId) || (s.phase === "MINIGAME" && localMiniId) || (localIds.includes(active.id) && active.id) || defaultId;
  const me = s.players[myId];
  const myTurn = active.id === myId;
  const [panel, setPanel] = useState<"map"|"cast"|"book"|null>(null);
  const [tile, setTile] = useState<number|null>(null);
  const [filter, setFilter] = useState<string|null>(null);
  const [cashOffer,setCashOffer] = useState("");
  const [swap,setSwap] = useState("");
  const [bid, setBid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const inFlight = useRef(false);
  const sendRef = useRef(onAction);
  sendRef.current = onAction;
  async function act(a:SimsarAction, id=myId) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (await sendRef.current(a,id) === false) setError("الحركة ما دازتش. شوف وضعية الطابلة وعاود.");
    } finally {inFlight.current = false; setBusy(false);}
  }
  useEffect(() => {
    if (s.phase !== "AUCTION") return;
    setBid("");
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 500);
    return () => clearInterval(id);
  },[s.phase, m.auctionEnd, myId]);
  useEffect(() => {
    let a:SimsarAction, delay = 1100;
    if (s.phase === "AUCTION") {
      a = {type:"FINALIZE_AUCTION"};
      delay = Math.max(150, m.auctionEnd-Date.now()+180);
    } else if (isHost && active.isBot && (s.phase === "ROLL_READY" || s.phase === "LANDED_DECISION")) a = {type:"BOT_STEP"};
    else return;
    let stop = false;
    let timer = window.setTimeout(async function run() {
      const ok = await sendRef.current(a, a.type === "BOT_STEP" ? defaultId : myId);
      if (!stop && ok === false) timer = window.setTimeout(run, 1300);
    },delay);
    return () => {stop=true; clearTimeout(timer);};
  },[isHost, active.id, active.isBot, s.phase, s.round, m.steps, m.built, s.pendingTileIndex, m.auctionEnd, defaultId, myId]);
  const seat = (id:string) => MOUL_CAST[m.cast[id] ?? 0];
  const people = s.turnOrder.map(id => ({id,name:s.players[id].nickname,color:seat(id).color,emblem:seat(id).emblem,character:m.cast[id],position:s.players[id].position}));
  const sites = MOUL_SITES.map((p,i) => ({...p,owner:s.properties[i].ownerId,level:s.properties[i].level}));
  const current = m.history[0] ?? null;
  const lastCue = useRef(current?.id);
  useEffect(() => {
    if (!current || current.id === lastCue.current) return;
    lastCue.current = current.id;
    if (current.kind === "PRIZE") simsarSfx.playFanfare();
    else if (current.kind === "RENT" && current.recipient === myId) simsarSfx.playCashGain();
    else if (current.kind === "RENT" || current.kind === "TAX") simsarSfx.playRentPaid();
    else simsarSfx.playBuildUpgrade(current.amount >= 400 ? 3 : 1);
  },[current,myId]);
  const openOffers = s.propertyOffers ?? [];
  const dealPhase = s.phase === "ROLL_READY" || s.phase === "LANDED_DECISION";
  const owned = (id:string) => sites.filter(z=>z.owner === id).length;
  const who = (id:string) => s.players[id]?.nickname ?? "—";
  function receiptText(e:MoulShot) {
    const place = sites[e.tile].name;
    if (e.kind === "RENT") return who(e.actor)+" خلّص "+ e.amount +" DH كرا لـ "+who(e.recipient!)+" · "+place;
    if (e.kind === "TAX") return who(e.actor)+" خلّص "+e.amount+" DH للقباضة";
    if (e.kind === "PRIZE") return who(e.actor)+" ربح "+e.amount+" DH فالتحدي!";
    if (e.kind === "BUY" && e.recipient) return who(e.actor)+" خذا "+place+" من "+who(e.recipient)+" مقابل "+e.amount+" DH"+(e.swapped !== undefined ? " و"+sites[e.swapped].name : "");
    return who(e.actor)+(e.kind === "BUY" ? " شرى " : " طوّر ")+place+" بـ "+e.amount+" DH";
  }
  function preview(i:number) {
    const z=sites[i];
    if (!z.price) return "ضريبة · حتى 80 DH";
    if (!z.owner) return "للبيع · "+z.price+" DH";
    return z.owner === active.id ? "ملكك · بلا كرا" : who(z.owner)+" · الكرا "+moulRent(i,s.properties)+" DH";
  }
  function inspect(i:number) {setTile(i);setPanel("map");}
  const pending = s.pendingTileIndex;
  const title = s.phase === "GAME_OVER" ? "مول البلاد" : s.phase === "MINIGAME" ? "تحدي الحومة" : s.phase === "AUCTION" ? "المزاد السرّي" : !myTurn ? "النوبة ديال "+active.nickname : s.phase === "ROLL_READY" ? "نوبتك · لوّح الزهر" : m.steps !== null ? "خرج "+m.steps+" · اختار الطريق" : pending !== null ? "تشري "+sites[pending].name+"؟" : "كمّل نوبتك";
  function button(label:string, a:SimsarAction, disabled=false) {
    return <button className={css.primary} disabled={busy || disabled} onClick={()=>act(a)}>{label}</button>;
  }
  const selected = tile !== null ? sites[tile] : null;
  return <main className={css.game} dir="rtl">
    <header className={css.head}><div><span className={css.kicker}>سمسار رويال 3D</span><h2>مول البلاد</h2></div><div className={css.match}><strong>{s.round === s.maxRounds ? "الجولة الأخيرة" : "الجولة "+s.round+" / "+s.maxRounds}</strong><span dir="ltr">{roomCode}</span></div></header>
    <div className={css.frame}><MoulDiorama sites={sites} people={people} activeId={active.id} highlight={filter} shot={current} onInspect={inspect}/></div>
    <section className={css.desk} aria-live="polite"><div className={css.turn}><h3>{title}</h3>{me && <b dir="ltr">{me.cash} DH</b>}</div>
      {s.phase === "GAME_OVER" ? <><p>{s.winnerSummaryAr}</p>{[...s.turnOrder].sort((a,b)=>s.players[b].netWorth-s.players[a].netWorth || s.players[b].cash-s.players[a].cash).map(id=><p key={id}>{seat(id).emblem} {who(id)} · {s.players[id].cash} DH كاش + {s.players[id].netWorth-s.players[id].cash} DH أملاك</p>)}{isHost && button("نلعبو من جديد",{type:"PLAY_AGAIN"})}</> :
       s.phase === "MINIGAME" && s.miniGame ? <SimsarMiniGames key={s.round+"-"+myId} miniGame={s.miniGame} myId={myId} players={s.players} isHost={isHost} onSubmitScore={score=>act({type:"SUBMIT_MINIGAME_SCORE",score})} onFinalizeMiniGame={()=>act({type:"FINALIZE_MINIGAME"})}/> :
       s.phase === "AUCTION" && pending !== null ? <><p>{sites[pending].name} · الثمن {sites[pending].price} DH · بقاو {Math.max(0,Math.ceil((m.auctionEnd-(now||Date.now()))/1000))} ث</p>
       {myId in m.bids ? <strong>عرضك تسجّل · {Object.keys(m.bids).length} / {people.length}</strong> : <div className={css.row}><input aria-label="عرضك بالدرهم" inputMode="numeric" type="number" min="1" max={me?.cash} value={bid} placeholder="العرض بـ DH" onChange={e=>setBid(e.target.value)}/>{button("سجّل العرض",{type:"MOUL_BID",amount:Number(bid)},!bid || Number(bid)<=0 || !Number.isInteger(Number(bid)) || Number(bid)>me?.cash)}{button("ندوز",{type:"MOUL_BID",amount:0})}</div>}<small>أكبر عرض كيربح. فالتعادل الأسبقية من مول النوبة بالدور.</small></> :
       !myTurn ? <p>{seat(active.id).emblem} {active.nickname} كيلعب. تقدر تشوف أملاك أي واحد لتحت.</p> :
       s.phase === "ROLL_READY" ? <><p>{s.round === 1 ? "عندك "+sites[me.position].name+". لوّح الزهر، وقارن جوج طرق قبل ما تتحرك." : "شوف الكرا وأملاك صحابك قبل ما تختار الطريق."}</p>{button("🎲  لوّح الزهر",{type:"ROLL_DICE"})}</> :
       m.steps !== null ? <div className={css.routes}>{([1,-1] as const).map(d=>{const i=routeTile(active.position,m.steps!,d);return <button key={d} disabled={busy} onClick={()=>act({type:"MOUL_ROUTE",direction:d})}><small>{d===1?"مع عقارب الساعة":"عكس عقارب الساعة"}</small><strong>{sites[i].name}</strong><span>{preview(i)}</span></button>})}</div> :
       pending !== null ? <><p>{rarity(sites[pending].price)} · الكرا {moulRent(pending,s.properties)} DH · {me.cash >= sites[pending].price ? "غيبقى ليك "+(me.cash-sites[pending].price)+" DH" : "الرصيد ما كافيش"}</p><div className={css.row}>{button("شري بـ "+sites[pending].price+" DH",{type:"BUY_PROPERTY"},me.cash<sites[pending].price)}{button("حلّ المزاد",{type:"START_AUCTION"})}</div></> :
       <><p>{sites[active.position].name} · دخل النوبة +35 DH</p>{button("سالي النوبة",{type:"END_TURN"})}</>}
      {error && <p role="alert">{error}</p>}
    </section>
    {current && <button className={css.receipt} onClick={()=>setPanel("book")}><small>آخر وصل</small><strong>{receiptText(current)}</strong></button>}
    {current && s.phase !== "GAME_OVER" && <div className={css.players}>{([["TBARKALLAH","تبارك الله 👏"],["PAY_RENT","خلّص أ المعلم 😂"],["BROKE","فلّستيني 💸"]] as const).map(([id,label])=><button key={id} disabled={busy} onClick={()=>act({type:"SEND_REACTION",reactionId:id})}>{label}</button>)}</div>}
    {people.filter(p=>s.players[p.id].lastReactionAt > Date.now()-6500).map(p=><p className={css.receipt} key={p.id}>{p.emblem} {p.name} · {s.players[p.id].lastReactionId==="BROKE"?"فلّستيني 💸":s.players[p.id].lastReactionId==="PAY_RENT"?"خلّص أ المعلم 😂":"تبارك الله 👏"}</p>)}
    {openOffers.filter(o=>o.fromPlayerId===myId || o.toPlayerId===myId).map(o=><div key={o.id} className={css.desk}><strong>{who(o.fromPlayerId)} باغي {sites[o.requestedTileIndex].name} من {who(o.toPlayerId)}</strong><p>مقابل {o.cashDh} DH {o.offeredTileIndex!==null && "و"+sites[o.offeredTileIndex].name}</p><div className={css.row}>{o.toPlayerId===myId ? <>{button("قبل الصفقة",{type:"ANSWER_PROPERTY_DEAL",offerId:o.id,accept:true},!dealPhase)}{button("رفض",{type:"ANSWER_PROPERTY_DEAL",offerId:o.id,accept:false})}</> : button("لغي العرض",{type:"CANCEL_PROPERTY_DEAL",offerId:o.id})}</div></div>)}
    <nav className={css.nav}><button onClick={()=>{setTile(null);setFilter(myId);setPanel("map")}}>🏠 أملاكي{me ? " · "+owned(myId):""}</button><button onClick={()=>setPanel("cast")}>🎭 الشخصيات</button><button onClick={()=>setPanel("book")}>🧾 الدفتر</button></nav>
    <div className={css.players}>{people.map(p=><button key={p.id} style={{borderColor:p.color}} onClick={()=>{setFilter(p.id);setTile(null);setPanel("map")}}>{p.emblem} {p.name} <small>{owned(p.id)} أملاك</small></button>)}</div>
    {panel && <div className={css.scrim} onClick={()=>setPanel(null)}><section role="dialog" aria-modal="true" aria-label={panel==="map"?"الأملاك":panel==="cast"?"الشخصيات":"الدفتر"} className={css.sheet} onClick={e=>e.stopPropagation()}>
      <header><h3>{panel==="cast"?"شخصيات الحومة":panel==="book"?"دفتر المعاملات":"أملاك الحومة"}</h3><button aria-label="سدّ" onClick={()=>setPanel(null)}>✕</button></header>
      {panel==="cast" ? <div className={css.cards}>{MOUL_CAST.map((c,i)=>{const id=s.turnOrder.find(id=>m.cast[id]===i);return <button key={c.name} disabled={busy || !!id || s.phase==="GAME_OVER"} style={{borderColor:c.color}} onClick={()=>act({type:"MOUL_CAST",character:i})}><strong>{c.emblem} {c.name}</strong><small>{id?who(id):"اختار الشخصية"}</small></button>})}</div> :
       panel==="book" ? <><p>من بعد {s.maxRounds} جولات كيربح اللي عندو أكبر مجموع ديال الفلوس وقيمة الأملاك.</p>{m.history.length ? m.history.map(e=><p key={e.id} className={css.line}>{receiptText(e)}</p>) : <p>أول عملية ديال الشرا ولا الأداء غتبان هنا.</p>}</> :
       <>{tile !== null && selected ? <div className={css.deed}><small>{MOUL_DISTRICTS[Math.floor(tile/4)]} · {rarity(selected.price)}</small><h3>{selected.name}</h3><p>{selected.owner ? seat(selected.owner).emblem+" "+who(selected.owner) : selected.price ? "باقي للبيع" : "ملك الجماعة"}</p>{!!selected.price && <p>الثمن {selected.price} DH · الكرا {moulRent(tile,s.properties)} DH · المستوى {selected.level+1}</p>}
       {selected.owner && <small>المالك عندو {districtCount(tile,selected.owner,s.properties)} فهاد الدرب. من جوج أملاك الكرا كيزيد بـ 50%.</small>}
       {selected.owner===myId && selected.level<2 && myTurn && ["ROLL_READY","LANDED_DECISION"].includes(s.phase) && m.steps===null && pending===null && button("طوّر بـ "+upgradePrice(tile)+" DH",{type:"UPGRADE_PROPERTY",tileIndex:tile},m.built || me.cash<upgradePrice(tile))}
       {dealPhase && selected.owner && selected.owner!==myId && !s.players[selected.owner].isBot && <div className={css.deal}><label>اقترح صفقة<input type="number" min="0" max={me?.cash} inputMode="numeric" placeholder="الثمن بـ DH" value={cashOffer} onChange={e=>setCashOffer(e.target.value)}/></label><select aria-label="ملك للتبادل" value={swap} onChange={e=>setSwap(e.target.value)}><option value="">بلا تبادل أملاك</option>{sites.map((x,i)=>x.owner===myId && <option key={i} value={i}>{x.name}</option>)}</select><button className={css.primary} disabled={busy || openOffers.some(o=>o.fromPlayerId===myId) || !Number.isSafeInteger(Number(cashOffer)) || Number(cashOffer)<0 || Number(cashOffer)>me?.cash || (!Number(cashOffer) && swap==="")} onClick={()=>{void act({type:"OFFER_PROPERTY_DEAL",requestedTileIndex:tile,offeredTileIndex:swap===""?null:Number(swap),cashDh:Number(cashOffer)});setPanel(null);setSwap("");setCashOffer("")}}>صيفط العرض</button></div>}
       <button onClick={()=>{setTile(null);setFilter(null)}}>شوف كاع الأملاك</button></div> : <><div className={css.players}><button onClick={()=>setFilter(null)}>الكل</button>{people.map(p=><button key={p.id} aria-pressed={filter===p.id} onClick={()=>setFilter(p.id)}>{p.emblem} {p.name}</button>)}</div><div className={css.cards}>{sites.map((z,i)=>(!filter||z.owner===filter) && <button key={i} onClick={()=>setTile(i)} style={{borderColor:z.owner ? seat(z.owner).color:undefined}}><strong>{z.name}</strong><small>{z.owner ? seat(z.owner).emblem+" "+who(z.owner):rarity(z.price)} · {z.price || 80} DH</small></button>)}</div></>}</>}
    </section></div>}
  </main>;
}
