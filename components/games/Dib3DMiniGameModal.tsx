"use client";

import React, { useState } from "react";
import {
  DIB3D_ARENA_HALF,
  DIB3D_CENTRAL_DRUM,
  DIB3D_ELECTRIC_BOX,
  DIB3D_TASK_STATIONS,
  DIB3D_VENTS,
  DIB3D_WALL_SEGMENTS,
  Dib3DRole,
  Dib3DTaskStationDef,
  Dib3DTaskStationId,
} from "@/games/dib3d/types";
import { sound } from "@/lib/sound";
import { vibrate } from "@/lib/fullscreen";
import { X, CheckCircle2, MapPin } from "lucide-react";

interface Dib3DMiniGameModalProps {
  station: Dib3DTaskStationDef;
  onComplete: (stationId: Dib3DTaskStationId) => void;
  onClose: () => void;
}

export function Dib3DMiniGameModal({
  station,
  onComplete,
  onClose,
}: Dib3DMiniGameModalProps) {
  const id = station.id;

  // 1. Farran Bread State (4 loaves: 0 = dough, 1 = in oven, 2 = baked!)
  const [loaves, setLoaves] = useState<number[]>([0, 0, 0, 0]);

  // 2. Cafe Atay State (4 sequential ingredients: 0..4)
  const [teaStep, setTeaStep] = useState<number>(0);

  // 3. Hanout Kunnach State (Math items)
  const [kunnachError, setKunnachError] = useState<boolean>(false);

  // 4. Zellige Lamp Wires State (4 colors connected)
  const [selectedWire, setSelectedWire] = useState<number | null>(null);
  const [connectedWires, setConnectedWires] = useState<number[]>([]);

  // 5. Attar Spices State (4 spices in order)
  const [spiceStep, setSpiceStep] = useState<number>(0);

  // 6. Hammam Furnace State (temperature 20 -> 100)
  const [temp, setTemp] = useState<number>(20);

  // 7. Sqaya Amphoras State (3 jugs: 0 -> 1 -> 2 full)
  const [jugs, setJugs] = useState<number[]>([0, 0, 0]);

  // 8. Sebbagh Dye Vats State (0 -> 3)
  const [dyeStep, setDyeStep] = useState<number>(0);

  // 9. Souika Carpet Dust Clouds (5 dust spots)
  const [dustCleared, setDustCleared] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);

  // 10. Medersa Sundial Rings (3 rings, target = 0)
  const [rings, setRings] = useState<number[]>([1, 2, 1]);

  const finishSuccess = () => {
    sound.playSuccess();
    vibrate([40, 30, 60]);
    onComplete(station.id);
  };

  return (
    <div
      className="fixed inset-0 z-[140] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none"
      dir="rtl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-400/70 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950/90 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{station.emoji}</span>
            <div>
              <h3 className="text-sm font-black text-amber-300">
                {station.title}
              </h3>
              <p className="text-[11px] text-slate-400">{station.zoneName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mini-Game Body */}
        <div className="p-5 space-y-4">
          {/* 1. FARRAN BREAD */}
          {id === "farran_bread" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-amber-200">
                ورك على كل خبزة جوج مرات: المرّة اللولة باش تقرصها، والثانية باش تطيب فـ الفران!
              </p>
              <div className="grid grid-cols-2 gap-3">
                {loaves.map((st, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (st >= 2) return;
                      sound.playCardFlip();
                      vibrate(25);
                      const next = [...loaves];
                      next[idx] = st + 1;
                      setLoaves(next);
                      if (next.every((v) => v >= 2)) {
                        setTimeout(finishSuccess, 180);
                      }
                    }}
                    className={`p-4 rounded-2xl border-2 font-black flex flex-col items-center gap-1 transition-all active:scale-95 ${
                      st === 0
                        ? "bg-slate-800 border-slate-600 text-slate-200"
                        : st === 1
                        ? "bg-orange-950/80 border-orange-400 text-orange-200 animate-pulse"
                        : "bg-emerald-950/80 border-emerald-400 text-emerald-300"
                    }`}
                  >
                    <span className="text-3xl">
                      {st === 0 ? "⚪" : st === 1 ? "🫓🔥" : "🥖✅"}
                    </span>
                    <span className="text-xs">
                      {st === 0
                        ? "قرّص العجينة"
                        : st === 1
                        ? "قلّبها فـ الفران!"
                        : "طابت محمّرة!"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. CAFE ATAY */}
          {id === "cafe_atay" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-emerald-200">
                عمّر البراد المغربي بالترتيب الصحيح باش يطلع أتاي مشحّر بالرزة!
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { step: 0, label: "1. أتاي شعرة 🍃", icon: "🍃" },
                  { step: 1, label: "2. النعناع الفليوي 🌿", icon: "🌿" },
                  { step: 2, label: "3. طوب السكر 🧊", icon: "🧊" },
                  { step: 3, label: "4. شحّر وكب من الفوق 🫖", icon: "🫖" },
                ].map((item) => {
                  const done = teaStep > item.step;
                  const active = teaStep === item.step;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      disabled={!active}
                      onClick={() => {
                        sound.playCardFlip();
                        vibrate(30);
                        const next = teaStep + 1;
                        setTeaStep(next);
                        if (next >= 4) setTimeout(finishSuccess, 180);
                      }}
                      className={`p-3.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition-all active:scale-95 ${
                        done
                          ? "bg-emerald-950/80 border-emerald-400 text-emerald-300"
                          : active
                          ? "bg-amber-500/20 border-amber-400 text-amber-200 animate-bounce"
                          : "bg-slate-800/60 border-slate-700 text-slate-500"
                      }`}
                    >
                      <span className="text-2xl">{done ? "✅" : item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. HANOUT KUNNACH */}
          {id === "hanout_kunnach" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-sky-200">
                اجمع الحساب فـ كناش الكريدي ديال الحاج مبارك:
              </p>
              <div className="p-3 rounded-2xl bg-slate-950 border border-sky-500/30 space-y-1.5 text-xs font-bold text-slate-200">
                <div className="flex justify-between">
                  <span>🧴 قرعة الزيت (1L)</span>
                  <span className="text-amber-300">20 درهم</span>
                </div>
                <div className="flex justify-between">
                  <span>🧊 قالب السكر</span>
                  <span className="text-amber-300">12 درهم</span>
                </div>
                <div className="flex justify-between">
                  <span>🛢️ بوطة صغيرة</span>
                  <span className="text-amber-300">15 درهم</span>
                </div>
              </div>
              {kunnachError && (
                <p className="text-[11px] font-black text-rose-400">
                  ❌ الحساب غالط! عاود جمع: 20 + 12 + 15
                </p>
              )}
              <div className="grid grid-cols-3 gap-2.5">
                {[42, 47, 55].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      if (val === 47) {
                        finishSuccess();
                      } else {
                        sound.playLightsOut();
                        vibrate(60);
                        setKunnachError(true);
                      }
                    }}
                    className="py-3 rounded-2xl bg-sky-600/25 hover:bg-sky-500/40 border-2 border-sky-400 text-sky-200 font-black text-sm active:scale-95"
                  >
                    {val} DH
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. ZELLIGE LAMP WIRES */}
          {id === "zellige_lamp" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-amber-200">
                لاقِ كل خيط على اليمين مع نفس اللون على اليسار باش يشعل الفانوس!
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  {[
                    { idx: 0, name: "🔴 الفاز الأحمر", cls: "border-rose-500 text-rose-300" },
                    { idx: 1, name: "🔵 النوتر الأزرق", cls: "border-sky-500 text-sky-300" },
                    { idx: 2, name: "🟡 الفانوس الأصفر", cls: "border-amber-400 text-amber-300" },
                    { idx: 3, name: "🟢 الأرضي الأخضر", cls: "border-emerald-500 text-emerald-300" },
                  ].map((w) => {
                    const done = connectedWires.includes(w.idx);
                    const sel = selectedWire === w.idx;
                    return (
                      <button
                        key={w.idx}
                        type="button"
                        disabled={done}
                        onClick={() => {
                          sound.playCardFlip();
                          setSelectedWire(w.idx);
                        }}
                        className={`w-full py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all ${
                          done
                            ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-400 opacity-60"
                            : sel
                            ? "bg-white/15 ring-2 ring-white " + w.cls
                            : "bg-slate-950 " + w.cls
                        }`}
                      >
                        {done ? "✅ راكب" : w.name}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {[2, 0, 3, 1].map((targetIdx) => {
                    const done = connectedWires.includes(targetIdx);
                    const labels = [
                      "🔴 قطب أحمر ⚡",
                      "🔵 قطب أزرق ⚡",
                      "🟡 قطب أصفر ⚡",
                      "🟢 قطب أخضر ⚡",
                    ];
                    return (
                      <button
                        key={targetIdx}
                        type="button"
                        disabled={done}
                        onClick={() => {
                          if (selectedWire === targetIdx) {
                            sound.playCardFlip();
                            vibrate(25);
                            const next = [...connectedWires, targetIdx];
                            setConnectedWires(next);
                            setSelectedWire(null);
                            if (next.length >= 4) {
                              setTimeout(finishSuccess, 180);
                            }
                          } else {
                            vibrate(50);
                            setSelectedWire(null);
                          }
                        }}
                        className={`w-full py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all ${
                          done
                            ? "bg-emerald-950/80 border-emerald-400 text-emerald-300"
                            : "bg-slate-800 border-slate-600 text-slate-200 hover:border-amber-400"
                        }`}
                      >
                        {done ? "✅ شاعل" : labels[targetIdx]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 5. ATTAR SPICES */}
          {id === "attar_spices" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-purple-200">
                خلّط عطرية راس الحانوت بالترتيب: خرقوم ⬅ كمون ⬅ تحميرة ⬅ سكينجبير!
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { s: 0, name: "🟡 خرقوم بلدي" },
                  { s: 1, name: "🟤 كمون بلدي" },
                  { s: 2, name: "🔴 تحميرة حلوة" },
                  { s: 3, name: "🟠 سكينجبير" },
                ].map((sp) => {
                  const done = spiceStep > sp.s;
                  const isNext = spiceStep === sp.s;
                  return (
                    <button
                      key={sp.s}
                      type="button"
                      onClick={() => {
                        if (!isNext) return;
                        sound.playCardFlip();
                        vibrate(25);
                        const next = spiceStep + 1;
                        setSpiceStep(next);
                        if (next >= 4) setTimeout(finishSuccess, 180);
                      }}
                      className={`p-3.5 rounded-2xl border-2 font-black text-xs transition-all active:scale-95 ${
                        done
                          ? "bg-emerald-950/80 border-emerald-400 text-emerald-300"
                          : isNext
                          ? "bg-purple-900/50 border-amber-400 text-amber-200 animate-pulse"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                    >
                      {done ? `✅ ${sp.name}` : sp.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. HAMMAM BERMA */}
          {id === "hammam_berma" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-rose-200">
                زيد العواد فـ الفرناشي حتّى توصل البرمة لـ 100°C!
              </p>
              <div className="w-full h-5 rounded-full bg-slate-950 border border-rose-500/40 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-all duration-200"
                  style={{ width: `${temp}%` }}
                />
              </div>
              <div className="text-lg font-black text-amber-300">
                🔥 حرارة البرمة: {temp}°C / 100°C
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playCardFlip();
                  vibrate(30);
                  const next = Math.min(100, temp + 20);
                  setTemp(next);
                  if (next >= 100) setTimeout(finishSuccess, 180);
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 border-2 border-amber-200 text-white font-black text-sm shadow-xl active:scale-95"
              >
                🪵 لوح العواد ونفخ فـ العافية (+20°C)
              </button>
            </div>
          )}

          {/* 7. SQAYA BUCKET */}
          {id === "sqaya_bucket" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-cyan-200">
                عمّر القلوشات بـ 3 من ما السقاية (ورك 2 مرات على كل قلوشة)!
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {jugs.map((lvl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (lvl >= 2) return;
                      sound.playCardFlip();
                      vibrate(25);
                      const next = [...jugs];
                      next[idx] = lvl + 1;
                      setJugs(next);
                      if (next.every((v) => v >= 2)) {
                        setTimeout(finishSuccess, 180);
                      }
                    }}
                    className={`p-3.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 active:scale-95 ${
                      lvl >= 2
                        ? "bg-cyan-950/85 border-cyan-400 text-cyan-200"
                        : lvl === 1
                        ? "bg-sky-950/80 border-sky-400 text-sky-200"
                        : "bg-slate-800 border-slate-600 text-slate-300"
                    }`}
                  >
                    <span className="text-2xl">
                      {lvl === 0 ? "🏺" : lvl === 1 ? "🏺💧" : "🏺🌊"}
                    </span>
                    <span>
                      {lvl === 0 ? "خاوية (0%)" : lvl === 1 ? "نص (50%)" : "عامرة! ✅"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 8. SEBBAGH WOOL */}
          {id === "sebbagh_wool" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-amber-200">
                غطّس الجلد فـ الجفان بـ 3 ديال دار الدبّاغ بالترتيب!
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { idx: 0, label: "1. الزعفران الأصفر", emoji: "🟡" },
                  { idx: 1, label: "2. العكر الفاسي", emoji: "🔴" },
                  { idx: 2, label: "3. النيلة الزرقاء", emoji: "🔵" },
                ].map((vat) => {
                  const done = dyeStep > vat.idx;
                  const active = dyeStep === vat.idx;
                  return (
                    <button
                      key={vat.idx}
                      type="button"
                      disabled={!active}
                      onClick={() => {
                        sound.playCardFlip();
                        vibrate(30);
                        const next = dyeStep + 1;
                        setDyeStep(next);
                        if (next >= 3) setTimeout(finishSuccess, 180);
                      }}
                      className={`p-3 rounded-2xl border-2 font-black text-[11px] flex flex-col items-center gap-1.5 active:scale-95 ${
                        done
                          ? "bg-emerald-950/80 border-emerald-400 text-emerald-300"
                          : active
                          ? "bg-amber-500/20 border-amber-300 text-white animate-bounce"
                          : "bg-slate-800 border-slate-700 text-slate-500"
                      }`}
                    >
                      <span className="text-2xl">{done ? "✅" : vat.emoji}</span>
                      <span>{vat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 9. SOUIKA CARPET */}
          {id === "souika_carpet" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-rose-200">
                ورك على غبرة الزربية بـ 5 باش تنفضها وترجع كتشعل!
              </p>
              <div className="relative p-4 rounded-2xl bg-gradient-to-br from-rose-900 via-red-950 to-amber-950 border-2 border-amber-400/60 grid grid-cols-5 gap-2">
                {dustCleared.map((cleared, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (cleared) return;
                      sound.playCardFlip();
                      vibrate(25);
                      const next = [...dustCleared];
                      next[idx] = true;
                      setDustCleared(next);
                      if (next.every(Boolean)) {
                        setTimeout(finishSuccess, 180);
                      }
                    }}
                    className={`py-4 rounded-xl border font-black text-lg transition-all active:scale-90 ${
                      cleared
                        ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
                        : "bg-slate-900/80 border-amber-300 text-white animate-pulse"
                    }`}
                  >
                    {cleared ? "✨" : "💨"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 10. MEDERSA CLOCK */}
          {id === "medersa_clock" && (
            <div className="space-y-3 text-center">
              <p className="text-xs font-bold text-teal-200">
                دوّر الحلقات النحاسية بـ 3 حتّى يوقفو كاملين فـ 12:00 ☀️!
              </p>
              <div className="space-y-2">
                {rings.map((val, idx) => {
                  const aligned = val === 0;
                  const hours = ["12:00 ☀️", "03:00 🌤️", "06:00 🌅", "09:00 🌙"];
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        sound.playCardFlip();
                        vibrate(20);
                        const next = [...rings];
                        next[idx] = (val + 1) % 4;
                        setRings(next);
                        if (next.every((v) => v === 0)) {
                          setTimeout(finishSuccess, 180);
                        }
                      }}
                      className={`w-full py-3 px-4 rounded-2xl border-2 font-black text-xs flex items-center justify-between active:scale-95 ${
                        aligned
                          ? "bg-emerald-950/80 border-emerald-400 text-emerald-300"
                          : "bg-slate-800 border-amber-400/60 text-amber-200"
                      }`}
                    >
                      <span>الحلقة النحاسية #{idx + 1}</span>
                      <span>{aligned ? "✅ 12:00 ☀️" : hours[val]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CORNER MEDINA LABYRINTH MINIMAP (76m x 76m)
// ============================================================================
interface Dib3DMinimapProps {
  playerX: number;
  playerZ: number;
  myRole: Dib3DRole;
  assignedTasks: Dib3DTaskStationId[];
  completedTasks: Dib3DTaskStationId[];
  isLightsOut: boolean;
}

export function Dib3DMinimap({
  playerX,
  playerZ,
  myRole,
  assignedTasks,
  completedTasks,
  isLightsOut,
}: Dib3DMinimapProps) {
  const [expanded, setExpanded] = useState(false);
  const span = DIB3D_ARENA_HALF * 2;
  const toPct = (coord: number) =>
    Math.max(4, Math.min(96, ((coord + DIB3D_ARENA_HALF) / span) * 100));

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      onPointerDown={(e) => e.stopPropagation()}
      className={`pointer-events-auto cursor-pointer rounded-2xl bg-slate-950/90 backdrop-blur-md border-2 border-sky-400/50 shadow-2xl overflow-hidden transition-all duration-200 relative ${
        expanded ? "w-56 h-56 sm:w-64 sm:h-64" : "w-24 h-24 sm:w-28 sm:h-28"
      }`}
      title="ورك باش تكبّر أو تصغّر خريطة الدرب"
    >
      {/* Medina Labyrinth Walls on Minimap */}
      {DIB3D_WALL_SEGMENTS.map((seg, i) => {
        const left = ((seg.x - seg.w / 2 + DIB3D_ARENA_HALF) / span) * 100;
        const top = ((seg.z - seg.d / 2 + DIB3D_ARENA_HALF) / span) * 100;
        const width = (seg.w / span) * 100;
        const height = (seg.d / span) * 100;
        return (
          <div
            key={i}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${Math.max(1.5, width)}%`,
              height: `${Math.max(1.5, height)}%`,
            }}
            className="absolute bg-amber-700/75 rounded-[1px]"
          />
        );
      })}

      {/* Central Drum Marker */}
      <div
        style={{
          left: `${toPct(DIB3D_CENTRAL_DRUM.x)}%`,
          top: `${toPct(DIB3D_CENTRAL_DRUM.z)}%`,
        }}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-300 border border-slate-950"
      />

      {/* Electric Box Marker */}
      <div
        style={{
          left: `${toPct(DIB3D_ELECTRIC_BOX.x)}%`,
          top: `${toPct(DIB3D_ELECTRIC_BOX.z)}%`,
        }}
        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
          isLightsOut
            ? "w-3.5 h-3.5 bg-rose-500 ring-2 ring-amber-300 animate-ping"
            : "w-2 h-2 bg-sky-400"
        }`}
      />

      {/* Task Stations or Wolf Vents */}
      {myRole === "WOLF"
        ? DIB3D_VENTS.map((v) => (
            <div
              key={v.id}
              style={{ left: `${toPct(v.x)}%`, top: `${toPct(v.z)}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-purple-400 border border-white"
            />
          ))
        : DIB3D_TASK_STATIONS.map((st) => {
            const isAssigned = assignedTasks.includes(st.id);
            if (!isAssigned && !expanded) return null;
            const isDone = completedTasks.includes(st.id);
            return (
              <div
                key={st.id}
                style={{ left: `${toPct(st.x)}%`, top: `${toPct(st.z)}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              >
                <div
                  className={`rounded-full border border-slate-950 ${
                    isDone
                      ? "w-2 h-2 bg-emerald-400"
                      : isAssigned
                      ? "w-3 h-3 bg-amber-400 animate-pulse ring-2 ring-amber-300/60"
                      : "w-1.5 h-1.5 bg-slate-500"
                  }`}
                />
                {expanded && isAssigned && !isDone && (
                  <span className="text-[8px] font-black text-amber-200 bg-slate-950/90 px-1 rounded whitespace-nowrap">
                    {st.emoji}
                  </span>
                )}
              </div>
            );
          })}

      {/* Local Player Live Dot */}
      <div
        style={{
          left: `${toPct(playerX)}%`,
          top: `${toPct(playerZ)}%`,
        }}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-cyan-300 border-2 border-slate-950 shadow-lg ring-2 ring-cyan-400/70"
      />

      {/* Label */}
      <div className="absolute bottom-1 inset-x-1 flex items-center justify-between px-1 pointer-events-none">
        <span className="text-[8px] font-black text-sky-300 bg-slate-950/80 px-1 rounded flex items-center gap-0.5">
          <MapPin className="w-2.5 h-2.5" />
          {expanded ? "خريطة المدينة (ورك للتصغير)" : "🗺️ خريطة"}
        </span>
      </div>
    </div>
  );
}
