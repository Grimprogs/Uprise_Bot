# UPRISE Community Platform — Gap Analysis & Implementation Audit

**Date:** 2026-10-04
**Scope:** `Uprise_Bot-main/` (the active project: Discord bot, Express API, React dashboard, Prisma/SQLite). The outer repository root contains an older duplicate of this project. It is not audited here; see §9.
**Method:** Every backend, bot, schema and API file was read, and the dashboard was read for its API calls and data handling. The following were also run: a TypeScript typecheck, module loading under plain `node` (the production start path), and both entry points booted under plain `node`. Findings marked **(Plausible)** are race conditions inferred from code that were not reproduced.

> **Includes work from this session.** Phone-number verification and the voice-channel system were added earlier in this session. During this audit one regression from that work was found and **fixed**: `npm start` crashed on boot (details in §9). One privacy issue from that work is still **open**: the phone number is written to the bot log (§8).

**Legend:** ✅ Complete · 🟡 Partial · ❌ Missing · 🔴 Broken (code exists but behaves incorrectly)

---

## 1. Executive Matrix

| # | Feature | Status | Primary file(s) | Critical gaps |
|---|---|---|---|---|
| 1 | Database is the source of truth | 🟡 | `verificationService.ts`, `xpService.ts` | The database is authoritative and Google Sheets is not on the critical path. However, ledger rows get deleted (§5), so the database history itself can't be trusted. |
| 2 | Works when Google Sheets fails | 🟡 | `verificationService.ts:214-241` | A Sheets failure doesn't block verification. But there's no retry or queue: failed rows are lost until an admin runs a manual Sync. |
| 3 | Verification entry point | 🟡 | `commands/verify.ts` | Discord form with 3 of its 5 possible fields, plus an email code. No web onboarding form for members. |
| 4 | Fields captured / validated | 🟡 | `verify.ts:190-218`, `utils/phone.ts` | Name, email and phone are collected. Email validation is only "contains @ and ." — **no proper (RFC 5322) check, no Gmail-only rule**. **Age/18+, interests and student/professional status are missing.** |
| 5 | Proof of email ownership | 🔴 | `verify.ts:264`, `server.ts:812`, `server.ts:830` | The code is **shown in Discord** whenever Gmail can't send. The web API **returns the code** in its response. The web check isn't tied to the Discord account. |
| 6 | Verification idempotency (no double rewards) | 🟡 | `verificationService.ts:58-75`, `xpService.ts:58-69` | The XP guard works for a single request. Two simultaneous submissions could double-award **(Plausible)**. Members who leave and rejoin get stuck (§2). |
| 7 | Role swap on verification | 🟡 | `verificationService.ts` (`syncDiscordRoles`) | @New Member → @Community Member works. **Interest and status roles are missing.** |
| 8 | Sheets typing (IDs / phone saved as text) | ✅ | `googleWorkspaceService.ts:70-88` | Fixed this session (values stored as text with a leading `'`). |
| 9 | Sheets update-in-place by Discord ID | ❌ | `googleWorkspaceService.ts:200-227` | Rows are only ever appended, so re-verification creates duplicate rows. |
| 10 | Timeouts on Google API calls | 🟡 | `googleWorkspaceService.ts` | Append and Gmail have a 10s timeout. **Create and Sync have none, and Sync ignores HTTP errors.** |
| 11 | Invite tracking | 🟡 | `inviteService.ts`, `guildMemberAdd.ts` | Vanity URLs are handled safely. Deleted invites, simultaneous joins and multiple servers can credit the wrong inviter. |
| 12 | Referral states PENDING → VALID | 🟡 | `referralService.ts`, `verificationService.ts:97` | VALID is only set after verification (correct). The rejoin path reassigns the inviter. Admin status flips aren't symmetric. |
| 13 | Referral abuse protection | 🟡 | `referralService.ts:26,43` | Bots and self-referrals are blocked. **Cyclic referrals, alt accounts and new-account checks are missing.** |
| 14 | XP awards are atomic | 🟡 | `xpService.ts:20` | Each single award runs in a database transaction. The verification flow (referral + 2 awards + verified flag) does not. |
| 15 | Immutable XP ledger | 🔴 | `xpService.ts:81-88`, `referralService.ts:166`, `schema.prisma:56` | No balance-before/after, reference ID or actor columns. Ledger rows are **deleted** when a member leaves or is removed. |
| 16 | Penalty when a member leaves | 🔴 | `referralService.ts:142-307` | The penalty **repeats every 20s until the member's XP reaches 0**. A failed lookup counts as "left". |
| 17 | `/xp`, `/leaderboard`, `/referrals` | ✅ | `commands/*.ts` | Work. Minor: `/xp @anyone` creates database rows, and the leaderboard counts unverified and departed users. |
| 18 | `/admin-xp`, `/admin-referral` | ✅ | `commands/admin*.ts` | Restricted to Manage Server in Discord and re-checked server-side. |
| 19 | Sync with Discord's native Scheduled Events | ❌ | — | None. |
| 20 | Event voice channel scheduler | ✅ | `eventChannelService.ts`, `voiceScheduler.ts` | Built this session. Tested with fake Discord objects, not live. |
| 21 | Join-to-Create voice channels | ✅ | `voiceChannelService.ts`, `voiceStateUpdate.ts` | Built this session. Bots excluded from occupancy, rename limit handled. Not live-tested. |
| 22 | `/event join`, `leave`, `checkin` + attendance | ❌ | — | No commands, no database tables. |
| 23 | Server-side permissions in Discord | 🟡 | admin commands, `eventVc.ts`, `vc.ts` | Uses Discord permission flags. **No OWNER/ADMIN/MODERATOR roles are defined**, and only 3 role IDs are configurable. |
| 24 | **Dashboard / API authentication** | ❌ | `server.ts` (all 28 API routes) | **No authentication at all**, and the server listens on all network interfaces. |
| 25 | Manual "Resync to Google Sheets" | ✅ | `server.ts:930`, `GoogleSheetsHub.tsx` | Exists, but anyone can trigger it (#24). |
| 26 | Personal data protection | 🔴 | `server.ts:224,256,1073`, `verify.ts:254` | Emails, phones and the Google token are readable without login. Emails and phones are written into bot logs. |
| 27 | Restart safety / crash safety | 🟡 | `client.ts:125,154`, `ready.ts:91` | The two background loops (departure audit, leaderboard refresh) pile up on each restart. Member join/leave errors aren't caught and can crash the process. |
| 28 | Deployment hygiene | 🟡 | repo root, `prisma/`, `data/` | Duplicate stale project, two SQLite files, depends on an expiring Google token. |

**Overall:** the core Discord flows (verify → reward → role, leaderboard, admin commands) work for a member's *first* join. Four things block production:
1. An **open admin API** with no authentication.
2. An **email verification bypass**.
3. A **departure penalty that drains member XP**.
4. A **mutable XP ledger**.

---

## 2. Verification Flow

**Entry points.** The `[VERIFY]` button and `/verify` both call `showDetailsModal` ([verify.ts](src/commands/verify.ts)). This opens a **Discord form, not a web form**. It uses 3 of its 5 text fields (name, email, phone). Submitting creates an email code record and sends it via Gmail. A second form takes the code and runs `VerificationService.verifyMember`. There is also a web route pair, `/api/verify/send-otp` and `/api/verify/confirm-otp`, which only the admin dashboard uses ([MembersView.tsx](src/components/MembersView.tsx)).

**Fields:**
| Field | Status | Where |
|---|---|---|
| Full name | ✅ 2–100 chars, enforced by Discord | [verify.ts](src/commands/verify.ts) `showDetailsModal` |
| Email | 🟡 only checks for `@` and `.`, no format standard, no Gmail-only option | [verify.ts:196](src/commands/verify.ts#L196), [server.ts:752](server.ts#L752) |
| Phone | ✅ 10–15 digits, international format, clear retry on error | [phone.ts](src/utils/phone.ts) |
| Age / 18+ | ❌ | — |
| Interest tags | ❌ (a Discord form can't hold multi-select; needs a follow-up dropdown menu or a web form) | — |
| Student / Professional | ❌ | — |

**🔴 C2 — Email ownership is never actually proven:**
- [verify.ts:264](src/commands/verify.ts#L264): when Gmail delivery fails or no token is stored, the reply shows **"Dev/Test Preview: Your code is `123456`"** to the member. The stored Google token expires after about 1 hour (C6), so in practice *every* verification after the first hour skips the email check.
- [server.ts:812](server.ts#L812): `/api/verify/send-otp` always returns `otpPreview` (the code itself).
- [server.ts:830-838](server.ts#L830-L838): the web check looks the code up **by email**, then verifies whatever `discordId` the request names. Combined with C1 (no auth), anyone can verify any Discord account with any email.
- Codes come from `Math.random()` ([verify.ts:221](src/commands/verify.ts#L221), [server.ts:767](server.ts#L767)). There's no limit on attempts per code, and codes are stored in plain text.

**Idempotency (protection against double rewards):**
- ✅ XP: `verifyMember` checks for an existing `NEW_MEMBER_VERIFICATION` ledger row ([verificationService.ts:58](src/services/verificationService.ts#L58)), and `awardXp` checks again inside its transaction ([xpService.ts:58-69](src/services/xpService.ts#L58-L69)).
- 🟡 Roles: assigning roles again is harmless (Discord's role add is idempotent), and the already-verified path re-syncs roles on purpose.
- 🔴 Sheets: rows are only appended ([googleWorkspaceService.ts:200](src/services/googleWorkspaceService.ts#L200)), so any second verification adds a second row.
- **(Plausible)** Two simultaneous submissions, for example Discord plus the dashboard, both pass the read-then-write check. No database uniqueness rule prevents a second `NEW_MEMBER_VERIFICATION` row.

**🔴 C5 — Members who leave and rejoin can't verify again:**
1. On leave, [referralService.ts:166-171](src/services/referralService.ts#L166-L171) **deletes** the verification ledger row, but never clears `User.verifiedAt`.
2. On rejoin, the referral is reset to PENDING ([referralService.ts:66-97](src/services/referralService.ts#L66-L97)) and @New Member is assigned again ([guildMemberAdd.ts:28](src/events/guildMemberAdd.ts#L28)).
3. `/verify` and the button reject them as "already verified" because `verifiedAt` is still set ([verify.ts:104](src/commands/verify.ts#L104), [verify.ts:124](src/commands/verify.ts#L124)). **The member is stuck as @New Member.**
4. The dashboard route doesn't check `verifiedAt`, so an admin re-verifying them awards **+100 again**, and the inviter gets **+250 again** against a -150 penalty: net **+100 per leave/rejoin cycle**.

**Role assignment:** `syncDiscordRoles` adds `COMMUNITY_MEMBER_ROLE_ID` and removes `NEW_MEMBER_ROLE_ID`, with errors only logged. ✅. Interest and status roles are ❌.

---

## 3. Google Sheets Integration

| Check | Status | Evidence |
|---|---|---|
| Database first, Sheets second | ✅ | The Sheet is written after all database writes, and failures are caught ([verificationService.ts:214-241](src/services/verificationService.ts#L214-L241)). The success message now reports when the Sheet write is pending. |
| IDs and phones saved as text | ✅ | The `asText()` helper ([googleWorkspaceService.ts:70](src/services/googleWorkspaceService.ts#L70)) is used for the phone, Discord ID and inviter ID columns. |
| One shared column definition | ✅ | `VERIFIED_MEMBER_HEADERS` is used by create, append and sync. |
| Update-in-place by Discord ID | ❌ | `values:append` only ([googleWorkspaceService.ts:208](src/services/googleWorkspaceService.ts#L208)). |
| Full sync correctness | 🔴 | [googleWorkspaceService.ts:247](src/services/googleWorkspaceService.ts#L247), [:287](src/services/googleWorkspaceService.ts#L287), [:314](src/services/googleWorkspaceService.ts#L314): the result of each `fetch` is never checked, so HTTP errors are **reported to the admin as success**. Old rows are never cleared, so if there are fewer members than last time, stale rows stay below the new data. |
| Timeouts | 🟡 | Append and Gmail: 10s. Create ([:176](src/services/googleWorkspaceService.ts#L176)) and all three sync writes: none. |
| Retry / queue | ❌ | A failed append is only logged to the console. The only recovery is a manual full Sync. |
| Credentials | 🔴 **C6** | The bot uses a **browser OAuth access token** that the dashboard posts into the settings table ([GoogleSheetsHub.tsx:76](src/components/GoogleSheetsHub.tsx#L76)). These tokens expire after about 1 hour. Firebase's sign-in popup provides no refresh token ([firebaseAuth.ts:19-22](src/services/firebaseAuth.ts#L19-L22) asks for "offline" access, but the token returned can't be refreshed). After an hour, Sheets appends and Gmail codes fail silently. This is **not** a service account, contrary to the original assumption. |

---

## 4. Referral & Invite Tracking

**Invite detection** ([inviteService.ts:122-240](src/services/inviteService.ts#L122-L240)):
- ✅ Vanity and unknown joins return `null` without crashing, and are logged as "Invite Not Identified".
- 🔴 **No handler for deleted invites.** [client.ts](src/bot/client.ts) only listens for created invites. Its fallback ([inviteService.ts:176-189](src/services/inviteService.ts#L176-L189)) assumes "a cached invite that disappeared was single-use and just used". So an invite that expired or was deleted between two joins gets **credited to the wrong inviter**.
- 🟡 Simultaneous joins both compare against the same cache snapshot, so one may be misattributed. There is no per-server lock.
- 🟡 After a restart, [inviteService.ts:145](src/services/inviteService.ts#L145) loads *all* stored invites without filtering by server, because the `TrackedInvite` table has no `guildId` column.

**Referral states:** PENDING on join ✅. VALID only inside `verifyMember` ✅ ([verificationService.ts:97](src/services/verificationService.ts#L97)). Problems:
- The rejoin path replaces the inviter with whoever invited this time ([referralService.ts:71](src/services/referralService.ts#L71)). This makes cyclic referrals possible: A invites B, then A leaves and rejoins through B's invite.
- Admin status changes through `PUT /api/referrals/:id` ([server.ts:541-562](server.ts#L541-L562)) are asymmetric. Going VALID → INVALID deducts 250. Going back to VALID re-awards nothing, because the duplicate check in [xpService.ts:39-45](src/services/xpService.ts#L39-L45) only counts `REFERRAL_LEFT_PENALTY` rows, not `REFERRAL_REVOKED_PENALTY`.

**Abuse protection:** bots ✅ ([referralService.ts:26](src/services/referralService.ts#L26)), self-referral ✅ ([:43](src/services/referralService.ts#L43)). Missing ❌: a minimum account age, alt-account signals, cycle detection, and a per-inviter reward cap.

**Atomicity of XP awards:** `awardXp` uses `prisma.$transaction` ✅. But `verifyMember` makes **three separate writes**: referral → VALID ([:97](src/services/verificationService.ts#L97)), inviter +250 ([:109](src/services/verificationService.ts#L109)), invitee +100 ([:148](src/services/verificationService.ts#L148)), then `verifiedAt` ([:188](src/services/verificationService.ts#L188)). If it fails partway, the referral can be VALID while the member has no XP or no verified flag. XP amounts come from config ✅, but the leave penalties (100 / 150 / 250) are hard-coded ([referralService.ts:156,208](src/services/referralService.ts#L156), [server.ts:424](server.ts#L424)).

**🔴 C3 — The departure penalty drains member XP:**
- `handleMemberLeave` deducts `min(100, xp)` every time it runs ([referralService.ts:155-163](src/services/referralService.ts#L155-L163)). It has no "already penalized" guard.
- `syncDepartedMembers` picks every user with `xp > 0` ([:287-294](src/services/referralService.ts#L287-L294)) and runs:
  - every 20s ([client.ts:154](src/bot/client.ts#L154)),
  - on **every interaction** ([interactionCreate.ts:25](src/events/interactionCreate.ts#L25)),
  - before each `/leaderboard` ([leaderboard.ts:111](src/commands/leaderboard.ts#L111)).
- Result: a departed member with 350 XP drops to 0 within about a minute, with a LEAVE log posted on each pass. Overlapping runs can also double-deduct.
- **False departures:** `guild.members.fetch(id).catch(() => null)` ([:297](src/services/referralService.ts#L297)) treats *any* error (network failure, Discord server error) as "member left". That applies the penalties, deletes the verification row, and sends the inviter a penalty message.
- Cost: each interaction can trigger up to N member lookups.
- If the bot is in more than one server, a member absent from server B is penalized even if they're in server A.

---

## 5. XP Transaction Ledger

`XPTransaction` ([schema.prisma](prisma/schema.prisma)) has: `id, userId, amount, reason, referralId, createdAt`.

| Required | Status |
|---|---|
| userId, amount, reason, timestamp | ✅ |
| balanceBefore / balanceAfter | ❌ |
| Generic referenceId (event, admin action, etc.) | ❌ only `referralId` |
| Actor (who made the change) | ❌ `adminId` is logged but not stored ([xpService.ts:81-88](src/services/xpService.ts#L81-L88)). The `/admin-xp` actor is only embedded in the reason text ([:151](src/services/xpService.ts#L151)). The dashboard adjust route stores no actor at all ([server.ts:1057](server.ts#L1057)). |
| Rows never change or disappear | 🔴 **C4** |

**C4 — The ledger can be altered:**
- [referralService.ts:166](src/services/referralService.ts#L166) runs `deleteMany` on verification rows.
- `XPTransaction.user` uses `onDelete: Cascade` ([schema.prisma:56](prisma/schema.prisma#L56)), so `DELETE /api/members/:id` ([server.ts:435](server.ts#L435)) erases that member's whole history.
- The balance floor `Math.max(0, xp + amount)` ([xpService.ts:72](src/services/xpService.ts#L72)) records the *requested* amount, not the amount actually applied ([:84](src/services/xpService.ts#L84)). So the sum of the ledger no longer equals the balance.
- `POST /api/transactions/adjust` passes `parseInt` output straight through, so a non-numeric amount becomes NaN ([server.ts:1053](server.ts#L1053)).

**Commands:** `/xp` ✅, `/leaderboard` ✅ (with page buttons), `/referrals` ✅, `/admin-xp` ✅, `/admin-referral` ✅. The two admin commands are restricted to Manage Server in Discord *and* re-check `memberPermissions` server-side. Notes:
- `/xp user:<x>` calls `getOrCreateUser` ([xp.ts:22](src/commands/xp.ts#L22)), which creates database rows for anyone looked up, including bots.
- The leaderboard counts all users, including unverified and departed ones ([leaderboardService.ts:29](src/services/leaderboardService.ts#L29)).

---

## 6. Events & Voice Channels

| Item | Status | Notes |
|---|---|---|
| Event voice channels: unlock at start, close at end | ✅ | [eventChannelService.ts](src/services/eventChannelService.ts): 30s checks plus exact timers. Safe after restarts (state is in the database). Opening can't happen twice. Ended channels are deleted once empty. |
| Join-to-Create channels | ✅ | Deleted when no humans remain (bots excluded via `humanCount`). Rename limit tracked locally, and Discord's own limit makes the request fail fast (see `client.ts` `rejectOnRateLimit`). |
| Discord native Scheduled Events sync | ❌ | No `guild.scheduledEvents` usage and no `GuildScheduledEvents` intent. |
| `/event join`, `/event leave`, `/event checkin` | ❌ | No commands. |
| Registration / attendance tables | ❌ | Only `ScheduledEventChannel` exists (channel lifecycle only). |

All voice items were checked with a 29-step test against a temporary database using fake Discord objects. **They have not been run against a live Discord server.**

---

## 7. Permissions & Roles (RBAC)

**Discord side (enforced server-side ✅):**
- `/admin-xp`, `/admin-referral`: Manage Server, hidden by default and re-checked when run.
- `/event-vc`: Manage Events / Manage Server, or `EVENT_MANAGER_ROLE_ID`.
- `/vc`: the channel owner, checked against the database; staff can't be kicked.

**Role model:** of the six roles in the spec, only `NEW_MEMBER_ROLE_ID`, `COMMUNITY_MEMBER_ROLE_ID` and `EVENT_MANAGER_ROLE_ID` are configurable ([config.ts](src/config/config.ts)). **OWNER, ADMIN and MODERATOR aren't modeled.** Admin checks use Discord permission flags, so the meaning depends on how the server's roles are set up. There's no central `hasRole(member, level)` helper.

**Dashboard: ❌ no permissions at all** (see §8). Firebase sign-in only exists inside the Sheets tab, to get a Google token. The server never checks it.

---

## 8. Admin Dashboard & API Layer

**🔴 C1 — The entire admin API is unauthenticated.** `server.ts` registers 28 `/api` routes with no auth middleware and listens on `0.0.0.0` ([server.ts:1103](server.ts#L1103)). Anyone who can reach the port can:
- `GET /api/settings` ([:224](server.ts#L224)): read every setting, **including `google_access_token`**, a live Gmail-send and Sheets token.
- `POST /api/settings` ([:237](server.ts#L237)): overwrite `google_spreadsheet_id`, sending future member data to **their own sheet**.
- `GET /api/members` ([:256](server.ts#L256)): download every member's **email and phone**.
- `POST /api/transactions/adjust` ([:1046](server.ts#L1046)), `PUT /api/referrals/:id`, `DELETE /api/members/:id`: change XP or erase history.
- `POST /api/bot/stop` ([:115](server.ts#L115)): take the bot offline.
- `POST /api/verify/*`: verify any Discord account (C2).
- `GET /api/logs` ([:1073](server.ts#L1073)): read logs that contain emails and phones.

**Coverage:** members ✅, XP adjustments ✅, referrals ✅, invites ✅, leaderboard ✅, logs ✅, manual Sheets resync ✅ ([:930](server.ts#L930)), real-time updates ✅. Events listing ❌, attendance ❌.

**Personal data in logs:**
- [verify.ts:254](src/commands/verify.ts#L254) writes the email **and phone** into a log, which is saved and posted to `BOT_LOG_CHANNEL_ID`. The phone was **added this session** (the email was already there).
- [server.ts:801](server.ts#L801) logs the email.
- Whether the log channel is "public" depends on its Discord permissions, but `/api/logs` exposes these entries to anyone regardless.

Discord replies that show the email/phone (the verify success message) are only visible to the member themselves ✅.

---

## 9. Critical Bugs & Architectural Risks (ranked)

| ID | Severity | Issue | Location |
|---|---|---|---|
| C1 | **Critical** | Admin API has no authentication; exposes personal data and a live Google token | `server.ts` (all routes) |
| C2 | **Critical** | Email check bypassed (code shown in Discord or returned by the API; web check not tied to the Discord account) | `verify.ts:264`, `server.ts:812,830` |
| C3 | **Critical** | Leave penalty repeats until XP is 0; any lookup error counts as "left"; runs on every interaction | `referralService.ts:142-307`, `interactionCreate.ts:25`, `client.ts:154` |
| C4 | **Critical** | Ledger rows deleted (on leave, by cascade); ledger total ≠ balance | `referralService.ts:166`, `schema.prisma:56`, `xpService.ts:72` |
| C5 | High | Members who rejoin can't verify again via Discord; dashboard re-verify repeats rewards (+100 net per cycle) | `verify.ts:104,124`, `referralService.ts:66-171` |
| C6 | High | Bot depends on a ~1h browser token with no refresh → Gmail and Sheets fail silently | `GoogleSheetsHub.tsx:76`, `verify.ts:241,335` |
| C7 | High | Errors in member join/leave handlers aren't caught; no global handler → one database error crashes the process (Node 24 default) | `client.ts:125-126` |
| H1 | High | Verification spans several writes with no shared transaction; double submission may double-award **(Plausible)** | `verificationService.ts:97-188` |
| H2 | High | Sheets: append-only duplicates; Sync reports HTTP failures as success and leaves stale rows | `googleWorkspaceService.ts:208,247,287,314` |
| H3 | High | Invites misattributed (no deleted-invite handler; simultaneous joins; not scoped per server) | `inviteService.ts:145,176`, `client.ts` |
| M1 | Medium | The departure-audit loop (`client.ts:154`) and leaderboard loop (`ready.ts:91`) pile up on each dashboard restart | `client.ts:154`, `ready.ts:91` |
| M2 | Medium | Hard-coded channel IDs | `ready.ts:58`, `leaderboardService.ts:96` |
| M3 | Medium | Codes from `Math.random`; no attempt limit; stored in plain text | `verify.ts:221`, `server.ts:767` |
| M4 | Medium | Code assumes a single server but loops over every server | `referralService.ts:284`, `leaderboardService.ts:94` |
| M5 | Medium | `/xp` creates database rows; leaderboard counts unverified and departed users | `xp.ts:22`, `leaderboardService.ts:29` |
| R1 | Risk | A stale duplicate of the whole project sits at the repo root (no Sheets code, separate database). Easy to deploy the wrong one. | `../` |
| R2 | Risk | Two SQLite files (`data/uprise.db`, `prisma/data/uprise.db`). `DATABASE_URL` is resolved relative to `prisma/`, while `prisma.ts` creates `./data`. | `prisma.ts`, `.env.example` |
| R3 | Risk | Circular imports (`logger` ↔ `client` ↔ commands) only work in one load order. Loading `verify.ts` or `vc.ts` first crashes. Existing pattern; entry points are fine. | `utils/logger.ts` |
| ✔ | *Fixed during audit* | `npm start` crashed on boot (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). A constructor parameter property added this session in `VoiceActionError` isn't supported by Node's built-in TypeScript handling. `tsx` (dev) hid the problem. Rewritten; `node server.ts` now boots. | `voiceChannelService.ts` |

---

## 10. Actionable Next Steps

### P0 — Before any public deployment
1. **Lock down the API (C1).**
   - Add `requireAdmin` middleware on `/api/*`: verify the Firebase ID token server-side with `firebase-admin` and check the user against an `ADMIN_EMAILS` / admin Discord ID allowlist. Also send the ID token from the dashboard (`auth.currentUser.getIdToken()`).
   - Bind the server to `127.0.0.1` or run it behind an authenticating proxy.
   - Remove `google_access_token` from `GET /api/settings`, and allowlist which keys `POST /api/settings` accepts.
2. **Make email verification real (C2, M3).**
   - Delete the preview line at `verify.ts:264` (or gate it behind `NODE_ENV !== 'production' && DEV_OTP_PREVIEW`).
   - Remove `otpPreview` from `server.ts:812`.
   - Look up codes by `{ discordId, email }`.
   - Generate codes with `crypto.randomInt`.
   - Schema: `OTPVerification { otpHash String, attempts Int @default(0) }`. Lock after 5 attempts and add a send rate limit.
3. **Replace the browser token (C6).** Use a Google **service account** (JWT via `googleapis` / `google-auth-library`) for Sheets, with credentials in environment variables. For email, use Gmail with domain-wide delegation, or a transactional provider (SES, Resend, Postmark).
4. **Fix departures (C3).**
   - Schema: add `User.leftAt DateTime?`.
   - Make `handleMemberLeave` idempotent: `updateMany where leftAt null` claims the departure, and penalties apply only when that claim succeeds. Clear `leftAt` on rejoin.
   - Delete the calls at `interactionCreate.ts:25` and `leaderboard.ts:111`.
   - Replace the 20s loop with a single check at startup using one `guild.members.fetch()`. Only treat Discord's "Unknown Member" error (10007) as departed.
5. **Stop deleting the ledger (C4).**
   - Remove `referralService.ts:166-171`.
   - Change `XPTransaction.user` to `onDelete: Restrict`, and make `DELETE /api/members/:id` a soft delete (`User.deletedAt`).
   - Record the amount actually applied (`after - before`), not the requested amount.
6. **Fix rejoin (C5).** Clear `User.verifiedAt` on leave. Decide whether rewards happen once per lifetime or once per membership, and enforce it with a unique key (step 9), not by deleting rows.
7. **Crash safety (C7).** Add `.catch()` to every event listener in `client.ts`, plus `process.on('unhandledRejection', …)` that logs to `Logger`.

### P1 — Correctness & data integrity
8. **Atomic verification (H1).** Pass a transaction client into `XpService.awardXp(tx, …)`. Wrap referral → VALID, both awards and `verifiedAt` in one `prisma.$transaction`. Start it with `user.updateMany({ where: { id, verifiedAt: null } })` and stop if 0 rows changed.
9. **Ledger migration:**
   ```prisma
   model XPTransaction {
     // existing fields…
     balanceBefore  Int
     balanceAfter   Int
     actorId        String?   // admin discordId / "SYSTEM"
     referenceType  String?   // REFERRAL | EVENT | ADMIN | VERIFICATION
     referenceId    String?
     idempotencyKey String?   @unique // e.g. "verify:<userId>", "referral:<id>:reward"
   }
   ```
   Backfill `balanceBefore`/`balanceAfter` by replaying each user's history in order.
10. **Sheets (H2).**
    - Update rows in place by Discord ID: read column F, then `values.update` the matching row, or append if none.
    - In `syncAllData`, check `res.ok` and add timeouts, and `values:clear` the tab before rewriting.
    - Add a `SheetSyncJob` outbox table (`payload, attempts, nextRunAt, lastError`) that `VoiceScheduler` processes with backoff.
11. **Invites (H3).** Handle the deleted-invite event (`Events.InviteDelete`). Add a per-server lock around `detectUsedInvite`. Add `guildId` to `TrackedInvite`.
12. **Referral abuse.**
    - Credit only if the account is at least N days old (`member.user.createdTimestamp`).
    - Reject cycles by walking the inviter's referral chain.
    - Keep the first inviter on rejoin.
    - Cap rewards per inviter per day.
    - Make admin VALID/INVALID changes symmetric.

### P2 — Missing spec features
13. **Onboarding fields.** The Discord form allows only 5 text fields and no dropdowns. After the form, send a follow-up message with dropdown menus for interests (multi) and status (Student/Professional), plus an 18+ confirmation button. Or build an authenticated web onboarding page.
    - Schema: `User.isAdult Boolean`, `status String?`, plus a `UserInterest` join table.
    - Config: `INTEREST_ROLE_MAP` / `STATUS_ROLE_MAP` → roles assigned in `syncDiscordRoles`.
14. **Email policy.** Use a proper email validator, plus an optional `EMAIL_DOMAIN_ALLOWLIST` (e.g. `gmail.com`).
15. **Events & attendance.**
    - Models: `Event`, `EventRegistration (@@unique([eventId, userId]))`, `EventAttendance`.
    - Commands: `/event join | leave | checkin`, with check-in limited to a time window and/or voice presence in the event channel.
    - Create a Discord Scheduled Event (`guild.scheduledEvents.create`, voice type, pointing at the event channel). Sync interest through the `GuildScheduledEvents` intent's user add/remove events.
    - Optional: award attendance XP through the ledger, using an idempotency key.
16. **RBAC.** Config: `OWNER_ROLE_ID`, `ADMIN_ROLE_ID`, `MODERATOR_ROLE_ID`. Add a central `hasRole(member, 'ADMIN' | …)` helper used by every command, and map the dashboard allowlist to the same levels.
17. **Dashboard.** Add `GET /api/events`, `/api/events/:id/attendance` and the matching views. Hide email/phone by default (reveal per row and audit each reveal).

### P3 — Hygiene
18. Manage the two background loops at `client.ts:154` and `ready.ts:91` the same way as `VoiceScheduler` (start on ready, stop in `stopDiscordBot`).
19. Move the hard-coded channel IDs (`ready.ts:58`, `leaderboardService.ts:96`) into config.
20. Stop `/xp` from creating database rows. Filter the leaderboard to verified, present members.
21. Remove email and phone from log messages (`verify.ts:254`, `server.ts:801`). Log a masked value or the user ID instead.
22. Delete the stale root copy. Use one database path. Plan a PostgreSQL migration for production (concurrent writes).
23. CI: run `tsc --noEmit` plus a `node server.ts` boot test, since `tsx` hides Node type-stripping errors. Pin a TypeScript version whose Windows binary is in the lockfile (TypeScript 7's native Windows package is missing).
