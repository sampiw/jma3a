# 🎮 JMA3A (جماعة) — Complete Games & System Specification

> **Target Audience**: AI Agents, Systems Engineers, Game Designers, and Frontend Developers.  
> **Repository**: `jma3a` (Next.js 15, TypeScript, Tailwind CSS, Redis / Upstash, SSE Realtime).  
> **Platform Mission**: Moroccan party game platform that eliminates physical board game boxes and commercial copies. Playable across smartphones in three modes: **Multi-Phone**, **One-Phone (Pass-the-phone)**, and **Hybrid (Multiple players sharing one or more phones)**.

---

## 📑 Table of Contents
1. [Platform Architecture & Engine Contracts](#1-platform-architecture--engine-contracts)
2. [Game 1: الذيب (DIB) — Werewolf / Loup-Garou](#game-1-الذيب-dib--werewolf--loup-garou)
3. [Game 2: الدخيل (L'Intrus) — Undercover / Spyfall](#game-2-الدخيل-lintrus--undercover--spyfall)
4. [Game 3: شكون فينا؟ (Chkon Fina?) — Most Likely To](#game-3-شكون-فينا-chkon-fina--most-likely-to)
5. [Game 4: مثلها (Mettelha) — Charades & Pantomime](#game-4-مثلها-mettelha--charades--pantomime)
6. [Game 5: ممنوع (Mamnou3) — Taboo / Forbidden Words](#game-5-ممنوع-mamnou3--taboo--forbidden-words)
7. [Game 6: مهمة سرية (Mission Sirriya) — Secret Social Missions](#game-6-مهمة-سرية-mission-sirriya--secret-social-missions)
8. [Multiplayer & Hybrid Device Security Primitives](#8-multiplayer--hybrid-device-security-primitives)
9. [Actionable Improvement Backlog for Incoming Agents](#9-actionable-improvement-backlog-for-incoming-agents)

---

## 1. Platform Architecture & Engine Contracts

Every game in JMA3A implements the standard `GameDefinition` interface defined in `games/registry.ts`:

```typescript
export interface GameDefinition<TState, TAction, TSettings> {
  id: GameId; // "dib" | "intrus" | "chkon-fina" | "mettelha" | "mamnou3" | "mission-sirriya"
  slug: string;
  version: number;
  displayNameKey: string;
  shortDescriptionKey: string;
  minPlayers: number;
  maxPlayers: number;
  capabilities: GameCapability[]; // "MULTI_PHONE" | "ONE_PHONE" | "HYBRID" | "PRIVATE_TURNS" | "ANONYMOUS_VOTING" | "TIMERS" | "SCORES" | "TEAM_MODE" | "REALTIME"
  defaultSettings: TSettings;
  validateSetup(players: Player[], settings: TSettings): ValidationResult;
  createInitialState(players: Player[], settings: TSettings): TState;
  handleAction(ctx: GameContext<TState, TSettings>, playerId: string, action: TAction): TransitionResult<TState>;
  getPublicView(ctx: GameContext<TState, TSettings>): PublicGameView;
  getPlayerView(ctx: GameContext<TState, TSettings>, playerId: string): PrivatePlayerGameView;
  checkFinished(ctx: GameContext<TState, TSettings>): GameEndResult | null;
}
```

### Core Principle: Strict Server Authority & Redaction
- **No secret data is ever sent to unauthorized devices**.
- The server calls `getPublicView` for the room and `getPlayerView` for the specific player bound to a device session.
- If two players share a device, the server returns `devicePlayers[]`, where each player object has its own separate `privateView`.

---

## Game 1: الذيب (DIB) — Werewolf / Loup-Garou

- **Directory**: `games/dib/engine.ts` | `components/games/DibGameView.tsx`
- **Min / Max Players**: 4 to 18 players.
- **Capabilities**: `MULTI_PHONE`, `ONE_PHONE`, `HYBRID`, `PRIVATE_TURNS`, `ANONYMOUS_VOTING`, `REALTIME`.

### 1. Concept & Moroccan Flavor
A hidden-role deduction game set in a traditional Moroccan neighborhood (الحومة). The village is plagued by wolves (الذيابة) who feed on villagers each night. Special characters have magical abilities to uncover truth, brew potions, or fire a last bullet.

### 2. Character Roles
| Role Key | Name in Darija | Description & Power |
| :--- | :--- | :--- |
| `villager` | **ولد البلاد (قروي)** | Ordinary citizen without night powers. Uses deduction, questions, and daytime voting. |
| `wolf` | **ذيب 🐺** | Wakes at night with the pack. Negotiates quietly and chooses 1 victim to eat. |
| `seer` | **الشوافة 🔮** | Wakes first at night. Inspects exactly 1 player per night to reveal if they are a wolf or innocent. |
| `witch` | **السحارة 🧪** | Wakes third at night. Sees the wolves' victim. Has 1 Life Potion (save) and 1 Death Potion (poison). |
| `hunter` | **الصياد 🎯** | When killed (by wolves, poison, or daytime vote), gets one final revenge bullet to eliminate any player. |

### 3. State Schema
```typescript
export interface DibState {
  playerStates: Record<string, {
    playerId: string;
    role: "villager" | "wolf" | "seer" | "witch" | "hunter";
    isAlive: boolean;
    deathRound?: number;
    deathReason?: "wolf" | "witch" | "vote" | "hunter";
  }>;
  phase: "ROLE_REVEAL" | "NIGHT_SEER" | "NIGHT_WOLF" | "NIGHT_WITCH" | "DAY_ANNOUNCEMENT" | "DISCUSSION" | "DAY_VOTE" | "HUNTER_REVENGE" | "GAME_OVER";
  round: number;
  seerTarget?: { targetId: string; result: "wolf" | "innocent" };
  seerHistory: Array<{ targetId: string; result: "wolf" | "innocent" }>;
  wolfVotes: Record<string, string>; // wolfPlayerId -> targetPlayerId
  wolfSignals: Array<{ wolfId: string; signal: string; timestamp: number }>;
  wolfVictimId?: string;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  witchActionDone: boolean;
  witchSavedPlayerId?: string;
  nightPendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" }>;
  nightSummary?: {
    deaths: Array<{ playerId: string; reason: "wolf" | "witch" }>;
    savedPlayerId?: string;
  };
  dayVotes: Record<string, string>; // voterId -> targetPlayerId
  lastEliminatedPlayerId?: string;
  hunterShooterId?: string;
  winner?: "village" | "wolves";
  narrationKey?: string;
}
```

### 4. Turn Cycle & Transitions
1. `ROLE_REVEAL`: Players inspect their 3D card secretly. Host clicks start or countdown ends.
2. `NIGHT_SEER`: Seer inspects 1 player (`SEER_INSPECT`). Only Seer receives the result.
3. `NIGHT_WOLF`: Wolves vote (`WOLF_VOTE`) and exchange signals (`WOLF_SIGNAL`). Single victim resolved.
4. `NIGHT_WITCH`: Witch is presented with the victim. Decides to save (`"save"`), poison (`"poison"`), or skip (`"skip"`).
5. `DAY_ANNOUNCEMENT`: The dawn breaks. The app displays `nightSummary` showing who died or if someone was saved.
6. `DISCUSSION`: Town open discussion.
7. `DAY_VOTE`: Town votes on a suspect (`DAY_VOTE`). Most voted is eliminated.
8. `HUNTER_REVENGE` *(Conditional)*: If eliminated player was Hunter, Hunter shoots a victim (`HUNTER_SHOOT`).
9. `GAME_OVER`: Evaluated whenever any player dies. Village wins if all wolves dead; Wolves win if wolves >= living villagers.

### 5. Configurable Settings
- `customRoles`: Host can customize exact counts for `{ wolf: number, seer: number, witch: number, hunter: number }` in lobby.
- `turnDurationSeconds`: Default 30s.

---

## Game 2: الدخيل (L'Intrus) — Undercover / Spyfall

- **Directory**: `games/intrus/engine.ts` | `components/games/IntrusGameView.tsx`
- **Min / Max Players**: 3 to 16 players.
- **Capabilities**: `MULTI_PHONE`, `ONE_PHONE`, `HYBRID`, `PRIVATE_TURNS`, `ANONYMOUS_VOTING`, `SCORES`.

### 1. Concept & Moroccan Flavor
Everyone in the group receives the exact same secret Moroccan word (e.g. *"طاجين بالبرقوق"*, *"كاس أتاي"*, *"درب غلف"*, *"حمّام الحومة"*), except one player — **الدخيل (The Intruder)**.
In the `close_words` variant, the intruder receives a closely related word (e.g. Regulars: *"طنجية"*, Intruder: *"طاجين"*). In `no_word`, the intruder sees *"أنت هو الدخيل! ما عندك حتى كلمة!"*.

### 2. State Schema
```typescript
export interface IntrusState {
  secretWord: string;
  intruderWord?: string;
  intruderPlayerId: string;
  phase: "SECRET_REVEAL" | "CLUE_ROUNDS" | "VOTING" | "VOTE_RESULT" | "INTRUDER_GUESS" | "ROUND_END" | "GAME_OVER";
  round: number;
  clueRoundIndex: number;
  turnOrder: string[]; // playerIds
  currentTurnPlayerId: string;
  votes: Record<string, string>; // voterId -> targetPlayerId
  intruderCaught: boolean;
  intruderGuessText?: string;
  intruderGuessCorrect?: boolean;
  scores: Record<string, number>;
}
```

### 3. Actions & Turn Flow
- `ACK_SECRET`: Player confirms reading their word.
- `NEXT_CLUE_TURN`: Moves clockwise to the next player to speak aloud a one-word or short clue.
- `START_VOTING`: Triggers anonymous ballot once clue rounds finish.
- `VOTE_INTRUDER`: Player submits suspect vote.
- `RESOLVE_VOTES`: Reveals who got the most votes.
- `INTRUDER_GUESS`: If intruder is caught, they get one final chance to guess the real secret word and steal the win!

---

## Game 3: شكون فينا؟ (Chkon Fina?) — Most Likely To

- **Directory**: `games/chkon-fina/engine.ts` | `components/games/ChkonFinaGameView.tsx`
- **Min / Max Players**: 3 to 20 players.
- **Capabilities**: `MULTI_PHONE`, `ONE_PHONE`, `ANONYMOUS_VOTING`, `REALTIME`, `SCORES`.

### 1. Concept & Moroccan Flavor
A high-energy social party question game. Each round reveals a funny, spicy, or relatable Moroccan prompt, and all players secretly point fingers by voting for the person in the group who fits the description best.

*Examples of content in `content/chkon-fina.json`*:
- *"شكون لي ديما كيوصل معطل بـ ساعتين وكيقول أنا فالطريق؟"*
- *"شكون لي كيبدا الريجيم نهار الاثنين ويحسبو نهار الثلاثاء مع الطاجين؟"*
- *"شكون لي يقدر يتفاوض مع مول الطاكسي حتى يردو هو لي كيسالو؟"*

### 2. State Schema
```typescript
export interface ChkonFinaState {
  currentPrompt: { id: string; prompt: string; category: string };
  usedPromptIds: string[];
  phase: "READ_PROMPT" | "VOTING" | "REVEAL_RESULTS" | "GAME_OVER";
  round: number;
  votes: Record<string, string>; // voterId -> candidateId
  results?: {
    counts: Record<string, number>;
    percentages: Record<string, number>;
    topCandidateId?: string;
    isUnanimous: boolean;
  };
  totalScores: Record<string, number>;
}
```

### 3. Configurable Settings
- `allowSelfVote`: Boolean (default `false`).
- `anonymousBallots`: Boolean (default `true`).
- `totalRounds`: Number (default `8`).

---

## Game 4: مثلها (Mettelha) — Charades & Pantomime

- **Directory**: `games/mettelha/engine.ts` | `components/games/MettelhaGameView.tsx`
- **Min / Max Players**: 2 to 20 players (2 Teams).
- **Capabilities**: `ONE_PHONE`, `TEAM_MODE`, `SHARED_SCREEN`, `TIMERS`, `SCORES`.

### 1. Concept & Moroccan Flavor
A team pantomime and gesture game. The phone is placed in front of an actor or held in hand. The actor must act out Moroccan characters, proverbs, movies, or daily situations without speaking a single word before the timer expires!

*Examples of content in `content/mettelha.json`*:
- *"مول الحانوت كيحسب الكريدي بالستيلو فوق الكارطونة"*
- *"كلا الهريسة بالغلط وبغى يطفي العافية"*
- *"الدار الكبيرة (مسلسل مغربي)"*
- *"كايتسنّى الطاكسي الكبير فالشتا"*

### 2. State Schema
```typescript
export interface MettelhaState {
  teams: Array<{
    id: string;
    name: string;
    playerIds: string[];
    score: number;
  }>;
  activeTeamIndex: number;
  activeActorId: string;
  currentPrompt: { id: string; prompt: string; category: string; difficulty: string };
  usedPromptIds: string[];
  phase: "TEAM_PREPARE" | "ACTING" | "TURN_SUMMARY" | "GAME_OVER";
  round: number;
  timerDurationMs: number;
  turnCorrectCount: number;
  turnSkipCount: number;
}
```

### 3. Actions & Timer Rules
- `START_ACTING`: Starts the 60s countdown.
- `MARK_CORRECT`: Awards points, draws next prompt immediately.
- `MARK_SKIP`: Skips card with penalty or zero score.
- `END_TURN`: Summarizes points and switches active team.

---

## Game 5: ممنوع (Mamnou3) — Taboo / Forbidden Words

- **Directory**: `games/mamnou3/engine.ts` | `components/games/Mamnou3GameView.tsx`
- **Min / Max Players**: 2 to 20 players (2 Teams).
- **Capabilities**: `ONE_PHONE`, `TEAM_MODE`, `SHARED_SCREEN`, `TIMERS`, `SCORES`.

### 1. Concept & Moroccan Flavor
A fast-talking Moroccan word game. The describer must make their teammates guess a Moroccan target word **WITHOUT** saying any of the 4 or 5 forbidden (ممنوع) taboo words printed on the card! An opponent monitors the phone screen to buzz if a forbidden word is slipped.

*Examples of cards in `content/mamnou3.json`*:
- **Target**: `طنجية` | **Forbidden**: `مراكش`, `لحم`, `فرناتشي`, `قلة`, `كامون`.
- **Target**: `الكسكاس` | **Forbidden**: `البرمة`, `الكسكس`, `التفويرة`, `السميد`, `القدرة`.
- **Target**: `الطاكسي الأحمر` | **Forbidden**: `كازا`, `الكونتور`, `بلاصة`, `الشيفور`, `صغير`.

### 2. State Schema
```typescript
export interface Mamnou3Card {
  id: string;
  target: string;
  forbidden: string[];
  category: string;
  difficulty: string;
}

export interface Mamnou3State {
  teams: Array<{ id: string; name: string; playerIds: string[]; score: number }>;
  activeTeamIndex: number;
  activeDescriberId: string;
  currentCard: Mamnou3Card;
  usedCardIds: string[];
  phase: "TEAM_PREPARE" | "DESCRIBING" | "TURN_SUMMARY" | "GAME_OVER";
  round: number;
  timerDurationMs: number;
  turnCorrectCount: number;
  turnTabooCount: number;
  turnSkipCount: number;
}
```

### 3. Scoring Rules
- Correct Guess: `+1 point`
- Taboo Word Spoken: `-1 point`
- Skip: `0 points` (or configurable)

---

## Game 6: مهمة سرية (Mission Sirriya) — Secret Social Missions

- **Directory**: `games/mission-sirriya/engine.ts` | `components/games/MissionSirriyaGameView.tsx`
- **Min / Max Players**: 3 to 20 players.
- **Capabilities**: `MULTI_PHONE`, `ONE_PHONE`, `HYBRID`, `PRIVATE_TURNS`, `REALTIME`, `SCORES`.

### 1. Concept & Moroccan Flavor
A psychological party game that plays passively in the background of a real gathering. Every player is assigned a secret mission to accomplish during real conversation without raising suspicion. If someone suspects them and calls them out, the mission fails!

*Examples of missions in `content/mission-sirriya.json`*:
- *"قنع شي واحد فالجلسة يشرب كاس ماء بلا ما تطلبها منو مباشرة"*
- *"خلي شي واحد يمدح الأكل ولا أتاي لي كاين فوق الطبلة"*
- *"جبد موضوع على الطفولة وخلي جوج على الأقل يعاودو ذكرياتهم"*
- *"خلي واحد يقول كلمة 'مستحيل' أثناء النقاش"*

### 2. State Schema
```typescript
export interface PlayerMission {
  missionId: string;
  instruction: string;
  difficulty: string;
  claimed: boolean;
  confirmed?: boolean;
  swappedOnce: boolean;
}

export interface MissionSirriyaState {
  playerMissions: Record<string, PlayerMission>;
  phase: "SECRET_REVEAL" | "ACTIVE_MISSIONS" | "CONFIRMATION" | "ROUND_REVEAL" | "GAME_OVER";
  round: number;
  currentClaimPlayerId?: string;
  confirmationVotes: Record<string, boolean>; // voterId -> confirmed
  scores: Record<string, number>;
  usedMissionIds: string[];
}
```

### 3. Action Lifecycle
1. `SECRET_REVEAL`: Each player checks their mission privately. Option to `SWAP_MISSION` once.
2. `ACTIVE_MISSIONS`: Real-life mingling / conversation.
3. `CLAIM_COMPLETION`: When a player succeeds, they press Claim.
4. `CONFIRMATION`: The group votes whether the player genuinely pulled it off or was caught red-handed.
5. `ROUND_REVEAL`: Points awarded (+100 for verified, -50 if caught).

---

## 8. Multiplayer & Hybrid Device Security Primitives

### Storage & Store (`lib/rooms/store.ts`)
- **Upstash Redis**: Stores rooms at `jma3a:room:${code}` and sessions at `jma3a:session:${sessionId}`.
- **Realtime**: PubSub SSE at `/api/rooms/[code]/stream` emitting events:
  - `ROOM_UPDATED`, `PLAYER_JOINED`, `PLAYER_LEFT`, `SETTINGS_UPDATED`, `GAME_STARTED`, `STATE_CHANGED`, `GAME_SWITCHED`, `PASS_THE_PHONE_STEP`.

### The Hybrid Device Model (`devicePlayers`)
When calling `/api/rooms/[code]/state`:
- The server inspects the caller's `sessionToken`.
- Finds all players where `p.deviceSessionId === sessionToken`.
- Returns an array `devicePlayers: DevicePlayerInfo[]`:
```typescript
export interface DevicePlayerInfo {
  id: string;
  nickname: string;
  isHost: boolean;
  avatarSeed: string;
  isAlive?: boolean;
  privateView?: PrivatePlayerGameView;
}
```
- **Security Guarantee**: Device A never receives the `privateView` or `myRole` of players assigned to Device B.
- **Device-Local Pass Curtain**: When a single physical device has multiple players, the client UI provides a local switcher with a privacy lock (`isLocalPrivacyLocked`) so Player A can hand the phone to Player B without showing their secret card.

---

## 9. Actionable Improvement Backlog for Incoming Agents

If you are tasked with upgrading or fixing the gameplay (particularly for **DIB**):

1. **Automated Game Master (Zero-Host Dependency)**:
   - Eliminate all manual *"Host clicks next phase"* buttons during gameplay.
   - Run server-side or synchronized client timers for each night phase (e.g. 20s for Seer, 30s for Wolves, 20s for Witch).
   - Advance immediately once all required role actions have been submitted.
   - If a role-holder is dead (e.g. Seer was killed), the server **must wait a randomized fake delay (5 to 8 seconds)** so alive players cannot guess that the Seer is dead.
2. **Audio Pacing & "Eyes Closed" Room Guidance**:
   - Provide voice narration audio cues in Moroccan Darija:
     - *"الليل طاح على الحومة، غمضو عينيكم كاملين"*
     - *"الشوافة تحل عينيها وتسول"*
     - *"الذيابة يفيقو ويتفقو"*
     - *"السحارة تفيق"*
     - *"الصباح طلع، فيقو يا أهل القرية"*
3. **Silent Haptics (Vibration)**:
   - When a specific player's turn arrives at night, trigger `navigator.vibrate([200, 100, 200])` so they wake up discreetly without physical noise.
4. **Day Voting Tie-Breakers**:
   - In `games/dib/engine.ts`, handle voting ties by having a 30s sudden-death revote between the tied candidates, or declare an acquittal where nobody is hanged.
5. **Night Phase UI for Multi-Player Shared Devices**:
   - When 2 players share a single device in DIB night, enforce a sequential pass mode with individual vibration alerts or prompt: *"دوز التليفون لـ [اسم اللاعب]"*.
