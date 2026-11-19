import { ChevronDown, Minus, Plus, Settings2 } from "lucide-react";
import {
  countDiibCardsCharacters,
  DEFAULT_DIIB_CARD_CHARACTERS,
  DIIB_CARD_CHARACTERS,
  parseDiibCardsCharacters,
  requiredDiibCardsPlayers,
  type DiibCardsCharacters as Characters,
} from "@/games/diib-cards/characters";
import { DIIB_CARDS_ROLE_META } from "@/games/diib-cards/types";

const labels: Record<keyof Characters, string> = {
  wolf: "الذيب القاتل",
  mute_wolf: "الذيب المسكّت",
  seer: "الشوّافة",
  witch: "السحّارة",
  hunter: "الصياد",
  protector: "الحارس",
};

interface Props {
  roles: Characters;
  playerCount: number;
  onEdit?: (roles: Characters | null) => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  error: string;
}

export function DiibCardsCharacters({ roles, playerCount, onEdit, onSave, dirty, saving, error }: Props) {
  const valid = Boolean(parseDiibCardsCharacters(roles));
  const specialCount = countDiibCardsCharacters(roles);
  const minimum = requiredDiibCardsPlayers(roles);
  return (
    <details className="group mb-5 overflow-hidden rounded-2xl border border-amber-400/25 bg-jma3a-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-5 w-5 shrink-0 text-jma3a-gold" aria-hidden="true" />
        <strong className="text-base text-jma3a-sand">الشخصيات</strong>
        <span className="ms-auto text-sm text-jma3a-muted">{specialCount} كوارط خاصة</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-jma3a-gold transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-jma3a-border p-3 sm:p-4">
        <p className="text-sm text-jma3a-muted">التوزيع كيبقى محفوظ فهاد الروم لكل ماتش. كيبقى بلاصة للمسيّر.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DIIB_CARD_CHARACTERS.map(role => (
            <li key={role} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-jma3a-border bg-jma3a-dark px-2 py-1.5">
              <span className="text-sm font-bold text-jma3a-sand">{DIIB_CARDS_ROLE_META[role].emoji} {labels[role]}</span>
              <span className="flex shrink-0 items-center gap-1" dir="ltr">
                {onEdit && <button type="button" aria-label={`نقص ${labels[role]}`} disabled={saving || roles[role] === 0} onClick={() => onEdit({ ...roles, [role]: roles[role] - 1 })} className="grid h-10 w-8 place-items-center rounded-lg bg-jma3a-surface text-jma3a-sand disabled:opacity-35"><Minus className="h-4 w-4" /></button>}
                <span className="w-6 text-center font-black tabular-nums text-amber-300" aria-label={labels[role]}>{roles[role]}</span>
                {onEdit && <button type="button" aria-label={`زيد ${labels[role]}`} disabled={saving || roles[role] >= 19 || specialCount >= 19} onClick={() => onEdit({ ...roles, [role]: roles[role] + 1 })} className="grid h-10 w-8 place-items-center rounded-lg bg-jma3a-surface text-jma3a-sand disabled:opacity-35"><Plus className="h-4 w-4" /></button>}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-jma3a-muted">القرويين: {Math.max(0, playerCount - 1 - specialCount)} · باقي البلايص كيتعمّرو بالقرويين.</p>
        {!valid && <p className="text-sm text-rose-300">خصّ على الأقل ذيب واحد وبلاصة للاعب من القرية.</p>}
        {valid && playerCount < minimum && <p className="text-sm text-amber-200">هاد التوزيع خاصّو {minimum} لاعبين مع المسيّر. تقدر تحفظو قبل ما يدخلو صحابك.</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {onEdit && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" disabled={saving || !dirty || !valid} onClick={onSave} className="rounded-xl bg-jma3a-gold px-4 py-2.5 text-sm font-black text-jma3a-dark disabled:opacity-50">
              {saving ? "كنحفظو…" : "حفظ الشخصيات"}
            </button>
            <button type="button" disabled={saving} onClick={() => onEdit({ ...DEFAULT_DIIB_CARD_CHARACTERS })} className="text-sm text-amber-200 disabled:opacity-40">رجّع الإعدادات الأصلية</button>
            {dirty ? <button type="button" disabled={saving} onClick={() => onEdit(null)} className="text-sm text-jma3a-muted disabled:opacity-40">إلغاء التعديلات</button> : <span className="text-sm text-jma3a-muted" role="status">محفوظ فهاد الروم</span>}
          </div>
        )}
      </div>
    </details>
  );
}
