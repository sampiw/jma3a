"use client";

import { useState } from "react";
import { Simsar3DBoardCanvas } from "./Simsar3DBoardCanvas";
import { MOUL_CAST, MOUL_SITES, routeTile } from "@/games/simsar3d/moulBoard";
import { SIMSAR_TOKEN_ORDER, type SimsarState, type SimsarTileSpec } from "@/games/simsar3d/types";
import styles from "./MoulGame.module.css";

const districtColors = ["#06b6d4", "#a855f7", "#f97316", "#10b981"];
const icons = ["☕","🥖","🏪","🌿","🌴","🧾","☕","🏨","☕","🧶","🏪","🏺","☕","🧾","🏪","👑"];
const tiles: SimsarTileSpec[] = MOUL_SITES.map((site, index) => ({
  index, kind: site.price ? "CITY" : "TAX", nameAr: site.name, shortAr: site.name,
  emoji: icons[index], colorHex: site.price ? districtColors[Math.floor(index / 4)] : "#be123c", price: site.price,
}));

export default function MoulDiorama({state,highlight,onInspect}: {
  state: SimsarState; highlight: string|null; onInspect: (i:number)=>void;
}) {
  const [fallback,setFallback] = useState(false);
  const [overview,setOverview] = useState(false);
  const m = state.moul!;
  const active = state.players[state.currentPlayerId];
  const areas = m.steps === null ? [] : [routeTile(active.position,m.steps,1),routeTile(active.position,m.steps,-1)];
  const players = Object.fromEntries(state.turnOrder.map(id => {
    const character = m.cast[id];
    return [id, {...state.players[id],token:SIMSAR_TOKEN_ORDER[character % SIMSAR_TOKEN_ORDER.length]}];
  }));
  // One server roll per seat and round. Keep its identity stable across room polls.
  const die = m.steps === null ? null : {die1:m.steps,die2:1,total:m.steps,isDoubles:false,multiplier:1 as const,
    rollerId:active.id,rollSeq:state.round * 8 + state.currentTurnIndex + 1,rolledAt:0};
  if (fallback) return <div className={styles.boardFallback}>{tiles.map(tile=>{
    const owner = players[state.properties[tile.index].ownerId ?? ""];
    return <button key={tile.index} onClick={()=>onInspect(tile.index)} style={{borderColor:owner?.accentHex ?? tile.colorHex}}><b>{tile.shortAr}</b><small>{owner ? MOUL_CAST[m.cast[owner.id]].emblem+" "+owner.nickname : tile.price ? tile.price+" DH" : "الضريبة"}</small></button>;
  })}</div>;
  return <div className={styles.royalBoard}>
    <Simsar3DBoardCanvas players={players} properties={state.properties} currentPlayerId={active.id} gardiennagePot={0}
      lastDice={die} cameraMode={overview?"OVERVIEW":"AUTO"} selectedTileIndex={null} onSelectTile={onInspect}
      neighborhood={{tiles,cast:m.cast,emblems:Object.fromEntries(state.turnOrder.map(id=>[id,MOUL_CAST[m.cast[id]].emblem])),focusOwner:highlight,routes:areas,shot:m.history[0] ?? null}} onGraphicsFailure={()=>setFallback(true)}/>
    <button className={styles.camera} aria-pressed={overview} onClick={()=>setOverview(!overview)}>{overview?"🎥 كاميرا اللعب":"🗺️ شوف الجزيرة"}</button>
  </div>;
}
