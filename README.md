# JMA3A (جماعة) — Moroccan Social Party Games Platform

> **"جمع الجماعة. اختار اللعبة. وبداو."**  
> *Social party games for physical gatherings (cafés, family, trips, campus) — zero install, instant browser play.*

---

## 🎮 V1 Game Catalog (6 Playable Games)

1. **DIB (الذيب)** — *Flagship Werewolf Social Deduction*
   - Automatic game master coordinates secrets, night sequence, accusations, day voting, and win conditions.
   - Roles: Villager (ولد البلاد), Werewolf (ذيب), Seer (الشوافة), Witch (السحارة).
   - Supports Multi-phone, One-phone (Pass-the-phone privacy curtain), and Hybrid modes.
2. **L'INTRUS (الدخيل)** — *Secret-Word Bluffing & Social Deduction*
   - Everyone gets the secret word except one Intruder.
   - Clue rounds, suspicion voting, and an optional guess-back steal mechanic for the Intruder.
   - 125 original secret concepts & 80 culturally rich word pairs.
3. **CHKON FINA? (شكون فينا؟)** — *"Who Among Us?" Social Voting*
   - Spicy and hilarious prompts revealing group dynamics.
   - Secret anonymous voting, aggregate percentage reveals, and unanimous highlight bonuses.
   - 185 prompts (155 in polished Moroccan Darija).
4. **METTELHA (مثلها)** — *Charades & Acting*
   - Team-based acting prompts from Moroccan daily life, sports, and culture without making a sound.
   - Large readable cards, thumb-friendly buttons (Correct +1, Skip 0), and 60s countdown timer.
   - 255 curated acting prompts.
5. **MAMNOU3 (ممنوع)** — *Taboo / Forbidden Words*
   - Describe the target word to your teammates without uttering any forbidden taboo words.
   - Taboo buzzer (-1 penalty), correct (+1), and team turn rotations.
   - 185 original cards with 3–5 forbidden words each.
6. **MISSION SIRRIYA (مهمة سرية)** — *Covert In-Person Gathering Missions*
   - Each player receives a subtle, secret social challenge to perform during the hangout.
   - Live completion claims, group confirmation verdicts, and points reveal.
   - 125 original safe social missions.

---

## 🛠️ Tech Stack & Architecture

- **Frontend & Fullstack**: Next.js 15+ (App Router), React 19, TypeScript strict mode.
- **Styling & Motion**: Tailwind CSS, CSS 3D transforms, Framer Motion, Lucide icons.
- **Audio Engine**: Procedural Web Audio API sound synthesizer (haptics, dawn chimes, suspense, fanfare).
- **Multiplayer & Realtime**: Server-Sent Events (SSE) `/api/rooms/[code]/stream` + state snapshot recovery.
- **Authoritative Security**: Server strictly redacts all hidden roles, words, and missions via `getPlayerView()`. Host is never omniscient.
- **Device Flexibility**: Supports `MULTI_PHONE` (QR join), `ONE_PHONE` (strict pass-the-phone blackout curtains), and `HYBRID`.
- **Group Continuity**: Host can switch games (`بدلو اللعبة`) or restart (`Play Again`) keeping the same room and all connected players!

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
pnpm install

# 2. Configure local environment
cp .env.example .env.local

# 3. Validate content quality (checks schemas, duplicates, minimums)
pnpm test:content

# 4. Run unit and game engine tests
pnpm test

# 5. Start development server
pnpm dev
```

Visit `http://localhost:3000` to play.

---

## 🧪 Testing & Validation

- `pnpm test:content` — Validates 950+ seed content items against strict Zod schemas and ensures zero duplicate IDs.
- `pnpm test` — Executes Vitest suite verifying game rules, tie resolutions, win conditions, and privacy redaction.
- `pnpm typecheck` — TypeScript strict type check with zero errors.
- `pnpm build` — Compiles production Next.js application.

---

## 🔒 Security & Privacy Rules

- **Zero Secret Exposure**: `.agent.env` and `.env.local` are strictly ignored by `.gitignore`.
- **Private Responses**: Sensitive endpoints use `Cache-Control: no-store, max-age=0`.
- **Authoritative Server**: Clients only express intent; the server enforces phase transitions and masks secret state.
