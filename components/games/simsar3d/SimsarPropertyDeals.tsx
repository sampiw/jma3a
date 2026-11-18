"use client";

import { useState } from "react";
import { Handshake, X } from "lucide-react";
import { BUILDING_TIER_NAMES_AR, isSimsarPropertyPhase, SIMSAR_BOARD_TILES } from "@/games/simsar3d/boardData";
import { SimsarAction, SimsarPropertyOffer, SimsarState } from "@/games/simsar3d/types";

const fieldStyle = "mt-1 min-h-10 w-full rounded-xl border border-white/15 bg-slate-900 px-3 text-sm text-white";
const primaryStyle = "min-h-10 rounded-xl bg-amber-300 px-3 text-sm font-black text-slate-950 disabled:opacity-40";
const secondaryStyle = "min-h-10 rounded-xl border border-white/15 px-3 text-sm font-bold text-slate-200 disabled:opacity-40";

function propertyLabel(tileIndex: number, level: SimsarPropertyOffer["requestedLevel"]) {
  const tile = SIMSAR_BOARD_TILES[tileIndex];
  return tile.kind === "CITY" ? `${tile.shortAr} ( ${BUILDING_TIER_NAMES_AR[level]} )` : tile.shortAr;
}

export function SimsarPropertyDeals({ state, playerId, initialTile, onAction, onClose }: {
  state: SimsarState;
  playerId: string;
  initialTile: number | null;
  onAction: (action: SimsarAction) => void | Promise<boolean>;
  onClose: () => void;
}) {
  const [requestedTile, setRequestedTile] = useState(initialTile === null ? "" : String(initialTile));
  const [offeredTile, setOfferedTile] = useState("");
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const player = state.players[playerId];
  const offers = state.propertyOffers ?? [];
  const outgoing = offers.find((offer) => offer.fromPlayerId === playerId);
  const incoming = offers.filter((offer) => offer.toPlayerId === playerId);
  const exchangeable = SIMSAR_BOARD_TILES.filter((tile) => {
    const prop = state.properties[tile.index];
    const owner = prop?.ownerId ? state.players[prop.ownerId] : undefined;
    return owner && !owner.isBankrupt && !owner.isBot && !prop.isMortgaged;
  });
  const theirs = exchangeable.filter((tile) => state.properties[tile.index].ownerId !== playerId);
  const mine = exchangeable.filter((tile) => state.properties[tile.index].ownerId === playerId);
  const canDeal = isSimsarPropertyPhase(state.phase) && player && !player.isBankrupt;
  const cashDh = Number(cash);
  const canSubmit = canDeal && requestedTile !== "" &&
    theirs.some((tile) => tile.index === Number(requestedTile)) &&
    (offeredTile === "" || mine.some((tile) => tile.index === Number(offeredTile))) &&
    Number.isSafeInteger(cashDh) && cashDh >= 0 && cashDh <= player.cash && (cashDh > 0 || offeredTile !== "");

  async function submit(action: SimsarAction) {
    setBusy(true);
    setError("");
    try {
      if ((await onAction(action)) === false) setError("العرض ما تبدّلش. شوف واش العقارات والرصيد باقيين متاحين.");
    } finally {
      setBusy(false);
    }
  }

  function offerContents(offer: SimsarPropertyOffer) {
    const offeredProperty = offer.offeredTileIndex !== null && offer.offeredLevel !== null
      ? propertyLabel(offer.offeredTileIndex, offer.offeredLevel)
      : null;
    return (
      <dl className="my-2 space-y-1 text-sm text-slate-200">
        <div><dt className="inline text-slate-400">العقار المطلوب · </dt><dd className="inline">{propertyLabel(offer.requestedTileIndex, offer.requestedLevel)}</dd></div>
        <div>
          <dt className="inline text-slate-400">المقابل · </dt>
          <dd className="inline font-bold text-amber-200">
            {offeredProperty}{offeredProperty && offer.cashDh > 0 && " + "}
            {offer.cashDh > 0 && <bdi>{offer.cashDh} DH</bdi>}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 backdrop-blur-sm"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="simsar-deals-title"
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border border-amber-300/30 bg-slate-950 shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <h2 id="simsar-deals-title" className="flex items-center gap-2 font-black">
            <Handshake className="h-5 w-5 text-amber-300" /> صفقات العقار
          </h2>
          <button type="button" onClick={onClose} aria-label="سد صفقات العقار" className="rounded-lg bg-slate-900 p-2">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {incoming.map((offer) => (
            <article key={offer.id} className="rounded-2xl border border-amber-300/30 bg-slate-900 p-3">
              <h3 className="font-bold text-amber-200">عرض من {state.players[offer.fromPlayerId]?.nickname}</h3>
              {offerContents(offer)}
              <div className="flex gap-2">
                <button className={primaryStyle} disabled={busy || !canDeal} onClick={() => {
                  void submit({ type: "ANSWER_PROPERTY_DEAL", offerId: offer.id, accept: true });
                }}>قبل العرض</button>
                <button className={secondaryStyle} disabled={busy} onClick={() => {
                  void submit({ type: "ANSWER_PROPERTY_DEAL", offerId: offer.id, accept: false });
                }}>رفض العرض</button>
              </div>
            </article>
          ))}
          {outgoing ? (
            <article className="rounded-2xl border border-white/10 bg-slate-900 p-3">
              <h3 className="font-bold">عرضك لـ {state.players[outgoing.toPlayerId]?.nickname}</h3>
              {offerContents(outgoing)}
              <button className={secondaryStyle} disabled={busy} onClick={() => {
                void submit({ type: "CANCEL_PROPERTY_DEAL", offerId: outgoing.id });
              }}>لغي العرض</button>
            </article>
          ) : theirs.length > 0 ? (
            <form className="grid gap-3" onSubmit={(event) => {
              event.preventDefault();
              if (busy || !canSubmit) return;
              void submit({
                type: "OFFER_PROPERTY_DEAL",
                requestedTileIndex: Number(requestedTile),
                offeredTileIndex: offeredTile === "" ? null : Number(offeredTile),
                cashDh,
              });
            }}>
              <label className="text-sm font-bold text-slate-300">
                العقار اللي بغيتي
                <select className={fieldStyle} value={requestedTile} onChange={(event) => setRequestedTile(event.target.value)}>
                  <option value="">اختار عقار</option>
                  {theirs.map((tile) => {
                    const prop = state.properties[tile.index];
                    return <option key={tile.index} value={tile.index}>{propertyLabel(tile.index, prop.level)} · {state.players[prop.ownerId!].nickname}</option>;
                  })}
                </select>
              </label>
              {mine.length > 0 && (
                <label className="text-sm font-bold text-slate-300">
                  عقار تعطيه فالمقابل
                  <select className={fieldStyle} value={offeredTile} onChange={(event) => setOfferedTile(event.target.value)}>
                    <option value="">بلا عقار</option>
                    {mine.map((tile) => (
                      <option key={tile.index} value={tile.index}>{propertyLabel(tile.index, state.properties[tile.index].level)}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm font-bold text-slate-300">
                المبلغ اللي غادي تخلّص (DH)
                <input type="number" inputMode="numeric" min={0} max={player?.cash ?? 0} step={1} className={fieldStyle} placeholder="0" value={cash} onChange={(event) => setCash(event.target.value)} />
              </label>
              <button className={primaryStyle} disabled={busy || !canSubmit} type="submit">صيفط العرض</button>
            </form>
          ) : incoming.length === 0 && (
            <p className="py-3 text-center text-sm text-slate-400">ما كاين حتى عقار متاح للصفقة دابا.</p>
          )}
          {!canDeal && <p className="text-xs font-bold text-amber-200">الصفقات كترجع من بعد هاد المرحلة.</p>}
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        </div>
      </section>
    </div>
  );
}
