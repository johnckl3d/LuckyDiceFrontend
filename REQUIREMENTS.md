# Lucky Dice — Product Requirements

## 1. Overview

Lucky Dice is a multiplayer dice game for **2–5 players**. Each player has **five six-sided dice**. The frontend is **Bootstrap 5** and **vanilla JavaScript**. Game outcomes (hand ranking, turn order, win/loss) are decided by a **server engine via HTTP API**. Until the real engine is available, the frontend **mocks API responses** and **mocks one AI player**.

This document describes the target game. The current prototype in `index.html` / `js/game.js` is a single-player hold-and-reroll table and should be replaced to match these requirements.

---

## 2. Goals

- Support up to **5 players** in one game (including the mocked AI player).
- Present a **four-row table layout** with drag-and-drop of paired dice.
- Enforce a **15-second** window to arrange dice and submit each turn.
- Call the **server engine** for ranking and next-turn decisions; use **mocked responses** in development.
- Include **one AI player** that plays without a human controlling its UI.

---

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| UI | Bootstrap 5 |
| Client logic | JavaScript (`js/game.js`, `js/api.js`) |
| Styling | Existing `css/styles.css` plus Bootstrap utilities |
| Engine | HTTP JSON API (mocked locally when `USE_ENGINE` is false) |
| AI | Client-side mock opponent that uses the same API contract |

---

## 4. Players

- A game has **2 to 5 players**.
- At least **one human** and **exactly one mocked AI player** in the default local experience.
- Remaining seats may be additional humans (up to the 5-player cap).
- Each player rolls **5 dice**. Faces are **1–6**.
- Player identity is a display name plus a stable `playerId` (string).

**Default mock lobby**

| Seat | Type | Example id | Example name |
| --- | --- | --- | --- |
| 1 | Human | `p-human` | You |
| 2 | AI | `p-ai` | House |

Additional human seats (`p-2` …) may be added until 5 players total.

---

## 5. UI layout

The play area is **four horizontal rows**. **Row 1 is lowest** (bottom of the screen). **Row 4 is highest** (top of the screen).

```
Row 4  [  ] [  ] [  ] [  ] [  ]   ← two-pair / second pair drop zone
Row 3  [  ] [  ] [  ] [  ] [  ]   ← pair-or-higher drop zone
Row 2  [D] [D] [D] [D] [D]        ← rolled dice (source)
Row 1  [ Submit ]  [ timer ]      ← submit + 15s countdown
```

### 5.1 Row 1 (bottom) — actions

- **Submit** button: sends the current board (dice in rows 2–4) to the engine.
- Visible **countdown** for the **15-second** drag-and-drop window.
- Submit is enabled only while the timer is running and the current player is human.
- Optional: New game / player list may sit outside the four rows (navbar or a side column), not inside row 1.

### 5.2 Row 2 — rolled dice

- Shows **five dice** generated for the current roll.
- Dice are **draggable** when the rules allow moving them to row 3 or row 4.
- Dice that are not parked in row 3/4 remain here.

### 5.3 Row 3 — pair (or higher) placeholders

- Empty **drop targets** (placeholders) for dice that form a **pair or better** (pair, triples, quads).
- The player may drag **the dice that belong to that combination** from row 2 onto row 3.
- Drop is **rejected** if the selection is not a valid pair-or-higher group (engine or client pre-check; engine is source of truth on submit).

### 5.4 Row 4 — second pair placeholders

- Empty **drop targets** for a **second pair** when the hand has **two pairs**.
- The player may drag the second pair from row 2 onto row 4.
- Drop is **rejected** if the hand does not have two pairs, or if the dropped dice are not the second pair.

### 5.5 Drag and drop rules (client)

- Support dragging **one or more dice** that form the allowed group (the paired faces).
- Dice can be moved back from row 3/4 to row 2 before submit.
- Visual state: empty placeholder vs occupied die (same die face styling as row 2).
- Keyboard/mouse: HTML5 drag-and-drop is acceptable; touch should work on typical mobile browsers where Bootstrap is used.

### 5.6 Other UI

- Navbar: game title, engine status (`local mock` / `connected` / `unreachable`).
- Status text: whose turn, round (1 or 2), time remaining, last ranking summary.
- Opponent hands (including AI): show **submitted** hands after each round tally, not live drag state during another player’s 15 seconds (unless the product later adds a spectator view).

---

## 6. Hand ranking

Higher rank number in this list is **worse**. Rank **1** is best.

| Rank | Hand | Definition |
| --- | --- | --- |
| 1 | Sequence 1-2-3-4-5 | Five dice showing 1, 2, 3, 4, and 5 (any order). |
| 2 | Quads | Four dice the same face. |
| 3 | Triples | Three dice the same face (and not quads / not 1-2-3-4-5). |
| 4 | Two pairs | Two different faces each appearing at least twice. |
| 5 | One pair | Exactly one face appearing at least twice, and not triples/quads/two pairs. |
| 6 | No pair | No face appears twice or more, and not 1-2-3-4-5. |

**Classification notes**

- **Five of a kind** is not listed separately; treat it as **quads** (rank 2) unless the engine later adds a higher rank.
- **Full house** (three of one face + two of another) is **triples** for ranking (rank 3). The pair may still be placed on row 4 if the product treats it as two pairs for **drop zones**; ranking remains triples. Preferred: drop the triple on row 3 and the pair on row 4; ranking still **triples**.
- **1-2-3-4-5** beats all pair-based hands, including quads.
- A **6** in the hand does not by itself change rank; it only matters for kickers if the engine uses them (see ties).
- **Ties:** same rank is compared by the engine (face values of the combination, then kickers). If still tied, the engine returns a deterministic order (e.g. stable `playerId` sort). Document the real engine’s tie-break when it exists; mocks must return a total order (no two players share `place`).

---

## 7. Game flow

### 7.1 Setup

1. Create a game with 2–5 players, including the mock AI.
2. Engine (or mock) assigns **first roller** (mock: human first).
3. Round counter starts at **First Round**.

### 7.2 First round — roll

1. The current player **rolls all five dice** (one automatic roll for that turn; no pre-roll hold).
2. If the five dice are **1, 2, 3, 4, 5** (any order), that player **wins the game immediately**. UI shows a win state; no 15-second window required.
3. Otherwise, the **15-second** timer starts.

### 7.3 First round — arrange and submit

During the 15 seconds:

- If the hand has a **pair or higher**, the player **may** drag those paired dice onto **row 3**.
- If the hand has **two pairs**, the player **may** also drag the second pair onto **row 4**.
- The player **must** click **Submit** before time expires.

**Timer expiry:** treat as submit of the **current** board (dice left on row 2 count as unplaced). Do not allow further drags.

**AI:** does not use the human timer UI. After its roll, the mock AI immediately (or after a short delay, e.g. 500–1500 ms) places valid pairs on row 3/4 and submits via the same API.

### 7.4 First round end — tally

After **every player** has submitted a first-round hand (or won instantly on 1-2-3-4-5):

1. Client sends all hands to the engine **tally** API (or the engine already stored them per submit).
2. Engine returns **ranking** for all players, **including the AI**.
3. The player with the **lowest rank** (worst hand; if several, worst after tie-break) gets the **next turn to roll** (starts **Second Round**).
4. UI shows the ranking table, then focuses the lowest-ranked player.

If someone already won on 1-2-3-4-5, skip tally for turn assignment and go to **game over**.

### 7.5 Second round — reroll

Only the player who ranked **lowest** after round 1 takes this turn (unless the engine later allows more second-round turns; not in this spec).

1. That player **selects any dice to reroll** (one or more of the five; selected dice are rerolled, unselected stay).
2. After the reroll, pair / two-pair **drop rules are the same** as round 1 (row 3 and row 4).
3. **15 seconds** to drag-and-drop and **Submit**.
4. Sequence **1-2-3-4-5** after the reroll **wins immediately**.

### 7.6 Second round end

1. Engine compares the acting player’s **new hand** to **all other players’** standing hands (hands from the end of round 1 for players who did not reroll).
2. If the acting player’s hand **cannot compete** — it is **strictly worse** than every other player’s hand (still lowest after ranking/tie-break) — that player **loses** and the **game restarts** (new game, same lobby or return to setup).
3. If the acting player **ties or beats** at least one other player such that they are **no longer uniquely worst**, they **stay in**; the engine returns updated ranking. (If the product should instead end the game whenever they are still last even after beating nobody, the mock should follow: **lose only when still last**. “Unable to compete with all other players” = still last vs the field.)

**Restart:** reset dice, rows, timers, and round; keep player list; assign first roller again via mock/engine.

---

## 8. Engine API (target contract)

Base URL: `ENGINE_URL` (default `http://localhost:8080`). Toggle with `USE_ENGINE` in `js/api.js`. When `USE_ENGINE` is `false`, **mock** the same shapes in the client.

All bodies are JSON. Dice values are integers `1–6`. Row placement: `row` is `2`, `3`, or `4` per die.

### 8.1 `GET /health`

**Response**

```json
{ "ok": true }
```

Mock: `{ "ok": false, "mode": "local" }` when not using the engine.

### 8.2 `POST /game/start`

**Request**

```json
{
  "players": [
    { "id": "p-human", "name": "You", "kind": "human" },
    { "id": "p-ai", "name": "House", "kind": "ai" }
  ]
}
```

**Response**

```json
{
  "gameId": "g-001",
  "round": 1,
  "currentPlayerId": "p-human",
  "players": [
    { "id": "p-human", "name": "You", "kind": "human" },
    { "id": "p-ai", "name": "House", "kind": "ai" }
  ]
}
```

### 8.3 `POST /roll`

First-round roll: all five dice. Second-round roll: reroll only selected indices.

**Request**

```json
{
  "gameId": "g-001",
  "playerId": "p-human",
  "held": [false, false, false, false, false]
}
```

Second round example (`true` = keep, `false` = reroll):

```json
{
  "gameId": "g-001",
  "playerId": "p-human",
  "held": [true, false, true, false, true]
}
```

**Response**

```json
{
  "values": [2, 2, 5, 6, 2],
  "instantWin": false,
  "handRank": 3,
  "handName": "triples",
  "allowedDrops": {
    "row3": [0, 1, 4],
    "row4": []
  },
  "timerSeconds": 15
}
```

- `instantWin`: `true` when values are a permutation of `1,2,3,4,5`.
- `allowedDrops.row3`: die indices that may be placed on row 3 (the pair-or-higher group).
- `allowedDrops.row4`: die indices for the second pair (empty if no two pairs).

### 8.4 `POST /submit`

**Request**

```json
{
  "gameId": "g-001",
  "playerId": "p-human",
  "values": [2, 2, 5, 6, 2],
  "placements": [3, 3, 2, 2, 3]
}
```

`placements[i]` is the row (`2`, `3`, or `4`) for `values[i]`.

**Response**

```json
{
  "accepted": true,
  "handRank": 3,
  "handName": "triples",
  "roundComplete": false,
  "nextPlayerId": "p-ai"
}
```

If placement violates drop rules, mock/engine returns `accepted: false` and an error message; client snaps illegal dice back to row 2 or rejects submit.

### 8.5 `POST /tally`

Called when the first round is complete (all players submitted) or after the second-round submit.

**Request**

```json
{
  "gameId": "g-001",
  "phase": "round1"
}
```

`phase` is `"round1"` or `"round2"`.

**Response (round 1)**

```json
{
  "ranking": [
    { "playerId": "p-ai", "place": 1, "handRank": 2, "handName": "quads", "values": [4, 4, 4, 4, 1] },
    { "playerId": "p-human", "place": 2, "handRank": 5, "handName": "one pair", "values": [3, 3, 1, 5, 6] }
  ],
  "nextPlayerId": "p-human",
  "gameOver": false,
  "winnerId": null,
  "loserId": null
}
```

`nextPlayerId` is the **lowest** ranked player (last `place`).

**Response (round 2)**

```json
{
  "ranking": [
    { "playerId": "p-ai", "place": 1, "handRank": 2, "handName": "quads", "values": [4, 4, 4, 4, 1] },
    { "playerId": "p-human", "place": 2, "handRank": 4, "handName": "two pairs", "values": [3, 3, 5, 5, 1] }
  ],
  "nextPlayerId": null,
  "gameOver": true,
  "winnerId": null,
  "loserId": "p-human",
  "restart": true
}
```

- `restart: true` when the second-round player **lost** (still cannot compete).
- If they improved enough to not lose, `gameOver` may be `false` and `restart` `false`; ranking is updated.

**Instant win response** (from `/roll` or `/tally`)

```json
{
  "gameOver": true,
  "winnerId": "p-human",
  "loserId": null,
  "restart": false,
  "ranking": [
    { "playerId": "p-human", "place": 1, "handRank": 1, "handName": "sequence 1-2-3-4-5", "values": [1, 2, 3, 4, 5] }
  ]
}
```

---

## 9. Mock API behavior

When `USE_ENGINE` is `false`:

- Implement the contracts above inside `js/api.js` (or a `js/mock-engine.js` imported by it).
- **Roll:** `1 + Math.floor(Math.random() * 6)` for each unheld die.
- **Hand evaluation:** local function matching section 6; compute `allowedDrops` from counts.
- **AI roll/submit:** after the human submits (or on AI’s turn), generate five dice, compute drops, auto-place pair indices on row 3 and second pair on row 4, then submit.
- **Tally:** sort players by `handRank` ascending (1 best), then by tie-break (higher pair/triple/quad face wins; then higher kicker). Assign `place` 1…N.
- **Round 1 next turn:** `nextPlayerId` = player with maximum `place`.
- **Round 2:** if acting player still has maximum `place` and is unique last, set `loserId`, `gameOver: true`, `restart: true`.

**Example mock first-round rolls** (for manual testing, optional seeded helper):

| Player | Values | Rank name |
| --- | --- | --- |
| Human | `[1, 2, 3, 4, 5]` | sequence (instant win) |
| Human | `[2, 2, 4, 6, 1]` | one pair → row 3: both 2s |
| Human | `[3, 3, 5, 5, 1]` | two pairs → row 3: 3s, row 4: 5s |
| AI | `[6, 6, 6, 2, 1]` | triples |

---

## 10. Mock AI player

- Kind `ai`, never waits on the 15-second human timer.
- Uses the same `/roll` and `/submit` payloads.
- **Strategy (v1):** always place every allowed die on row 3/4; never leave a legal pair on row 2.
- Does not cheat: same random roll path as humans in the mock.
- Shown in the ranking table with a badge (`AI`).

---

## 11. Timing

| Event | Duration |
| --- | --- |
| First round arrange + submit | 15 seconds |
| Second round arrange + submit | 15 seconds |
| AI think (mock) | 0.5–1.5 seconds (cosmetic) |

Timer starts when the roll result is shown, not before.

---

## 12. Non-goals (this version)

- Real multiplayer networking (WebSockets, accounts, rooms).
- Real server engine implementation (only the client mock + API shape).
- Yahtzee-style category scoring from the current prototype.
- More than 5 players.
- Dice faces other than 1–6.

---

## 13. Acceptance criteria

1. Layout has **four rows**, bottom row is submit (+ timer), second row is five dice, third and fourth rows are drop placeholders.
2. Maximum **5 players**; default mock includes **one AI**.
3. Rolling **1-2-3-4-5** wins immediately.
4. Pair or better can be dropped on **row 3**; two pairs can use **row 4** for the second pair. Illegal drops are blocked.
5. Human has **15 seconds** to arrange and submit; timeout auto-submits.
6. After round 1, **mocked tally** ranks everyone (including AI); **lowest** player rolls in round 2.
7. Round 2 allows **selecting any dice to reroll**, then the same drop + 15s submit rules.
8. If the round-2 player is still last vs all others, they **lose** and the **game restarts**.
9. With `USE_ENGINE === false`, all of the above works **without a live server**, using mocked JSON as in section 8.

---

## 14. Open points (confirm with product)

- Does **1-2-3-4-5** end the **entire game**, or only that player’s claim as rank 1 with others still finishing the round? This spec: **entire game win**.
- After round 2, if the player is **no longer last**, does play **stop** (draw / continue later rounds) or is that a **win**? This spec: **they do not lose**; game may remain open until product adds more rounds.
- Should **full house** rank above two pairs (as triples) only, or get its own rank? This spec: **triples**.
- Are extra humans local hot-seat (same browser) or future online seats? This spec: **local mock + one AI**; extra humans can be hot-seat later.
