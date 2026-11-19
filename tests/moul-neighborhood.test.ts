import { describe, it, expect } from "vitest";
import type { Player } from "@/lib/types";
import type { SimsarAction, SimsarState } from "@/games/simsar3d/types";
import { DEFAULT_SIMSAR_SETTINGS, Simsar3DEngine as game } from "@/games/simsar3d/engine";
import { MOUL_ROUNDS, MOUL_SITES, moulRent } from "@/games/simsar3d/moulBoard";

const seats = Array.from({length:7},(_,i)=>({id:"p"+i,nickname:"Player "+i,status:"ACTIVE",isHost:i===0} as Player));
const settings = {...DEFAULT_SIMSAR_SETTINGS,mode:"MOUL" as const};
const fresh = () => game.createInitialState(seats,settings);
const ctx = (state:SimsarState) => ({roomId:"QA",players:seats,state,settings,round:state.round,phase:state.phase,stateVersion:1});
const act = (s:SimsarState, actor:string, a:SimsarAction) => game.handleAction(ctx(s),actor,a);
function ok(s:SimsarState, actor:string, a:SimsarAction) {
  const out = act(s,actor,a);
  expect(out.success,out.error).toBe(true);
  return out.newState;
}
function land(s:SimsarState, steps:number) {
  const dice = ok(s,s.currentPlayerId,{type:"ROLL_DICE"});
  dice.moul!.steps=steps;
  return ok(dice,s.currentPlayerId,{type:"MOUL_ROUTE",direction:1});
}
describe("Moul L'Blad neighborhood",()=>{
  it("seats seven unique owners with equal wealth and reserves character choices",()=>{
    const s=fresh();
    expect(game.validateSetup(seats,settings).isValid).toBe(true);
    expect(game.validateSetup(seats,DEFAULT_SIMSAR_SETTINGS).isValid).toBe(false);
    expect(new Set(Object.values(s.moul!.cast)).size).toBe(7);
    expect(Object.values(s.players).map(p=>p.netWorth)).toEqual(Array(7).fill(920));
    expect(act(s,"p0",{type:"MOUL_CAST",character:1}).success).toBe(false);
    expect(ok(s,"p0",{type:"MOUL_CAST",character:7}).moul!.cast.p0).toBe(7);
  });
  it("transfers rent once, upgrades an owned street and lists the actual recipient",()=>{
    let s=land(fresh(),1);
    expect(act(s,"p1",{type:"BUY_PROPERTY"}).success).toBe(false);
    s=ok(s,"p0",{type:"BUY_PROPERTY"});
    expect(s.properties[1].ownerId).toBe("p0");
    s=ok(s,"p0",{type:"UPGRADE_PROPERTY",tileIndex:1});
    expect(act(s,"p0",{type:"UPGRADE_PROPERTY",tileIndex:1}).success).toBe(false);
    s=ok(s,"p0",{type:"END_TURN"});
    s.players.p1.position=0;
    const before=[s.players.p1.cash,s.players.p0.cash],rent=moulRent(1,s.properties);
    s=land(s,1);
    expect(s.moul!.history[0]).toMatchObject({kind:"RENT",actor:"p1",recipient:"p0",amount:rent});
    expect([s.players.p1.cash,s.players.p0.cash]).toEqual([before[0]-rent,before[1]+rent]);
    expect(act(s,"p1",{type:"MOUL_ROUTE",direction:1}).success).toBe(false);
  });
  it("hides sealed bids, closes early and records tax paid to the treasury",()=>{
    let s=ok(land(fresh(),1),"p0",{type:"START_AUCTION"});
    s=ok(s,"p1",{type:"MOUL_BID",amount:151});
    const pub=game.getPublicView(ctx(s)).publicData as unknown as SimsarState;
    expect(pub.moul!.bids).toEqual({p1:0});
    expect(act(s,"p1",{type:"MOUL_BID",amount:155}).success).toBe(false);
    expect(act(s,"p0",{type:"FINALIZE_AUCTION"}).success).toBe(false);
    for(const p of seats.filter(p=>p.id!=="p1")) s=ok(s,p.id,{type:"MOUL_BID",amount:0});
    expect(s.properties[1].ownerId).toBe("p1");
    s=ok(s,"p0",{type:"END_TURN"});
    s.players.p1.position=4;
    s=land(s,1);
    expect(s.moul!.history[0]).toMatchObject({kind:"TAX",amount:80,actor:"p1"});
  });
  it("settles a cash and shop exchange atomically",()=>{
    let s=ok(fresh(),"p0",{type:"OFFER_PROPERTY_DEAL",requestedTileIndex:8,offeredTileIndex:0,cashDh:55});
    const action={type:"ANSWER_PROPERTY_DEAL",offerId:s.propertyOffers![0].id,accept:true} as const;
    expect(act(s,"p2",action).success).toBe(false);
    s=ok(s,"p1",action);
    expect([s.properties[0].ownerId,s.properties[8].ownerId,s.players.p0.cash,s.players.p1.cash]).toEqual(["p1","p0",745,855]);
    expect(act(s,"p1",action).success).toBe(false);
  });
  it("completes twelve equal rounds, with only two minigames, and every seat still playing",()=>{
    let s=fresh(), turns=0, minis=0;
    while(s.phase!=="GAME_OVER" && turns<100) {
      if(s.phase==="MINIGAME") {
        for(const [i,p] of seats.entries()) s=ok(s,p.id,{type:"SUBMIT_MINIGAME_SCORE",score:i+20});
        expect(s.moul!.history[0]).toMatchObject({kind:"PRIZE",actor:"p6"});
        minis++;
      } else {
        const id=s.currentPlayerId;
        s=land(s,1);
        if(s.pendingTileIndex!==null){
          if(s.players[id].cash>=MOUL_SITES[s.pendingTileIndex].price) s=ok(s,id,{type:"BUY_PROPERTY"});
          else {s=ok(s,id,{type:"START_AUCTION"});for(const p of seats)s=ok(s,p.id,{type:"MOUL_BID",amount:0});}
        }
        s=ok(s,id,{type:"END_TURN"}); turns++;
      }
    }
    expect(turns).toBe(7*MOUL_ROUNDS);
    expect(minis).toBe(2);
    expect(s.phase).toBe("GAME_OVER");
    expect(s.players[s.winnerId!].netWorth).toBe(Math.max(...Object.values(s.players).map(p=>p.netWorth)));
  });
});
