---
name: SwimCoach app redesign decisions
description: Key product and design decisions from the 2026-06-25 panel session re-designing the SwimCoach app
metadata:
  type: project
---

# SwimCoach App Redesign — Session Decisions (2026-06-25)

## Product positioning
- Personal app for the builder (Teddy). No short-term plans to distribute publicly.
- NOT a beginner tool. Geared toward experienced swimmers with concrete goals who've done hundreds/thousands of workouts.
- High bar for personalization — the app must prove credibility fast or experienced swimmers won't come back.
- Serves multiple personas (not just Masters Mac): beginners, intermediates, elites, fitness swimmers, triathletes, rehab. But the current build is optimized for experienced swimmers.

## First-run experience (agreed by panel, revised by owner)
- Conversational onboarding: coach asks one question at a time (not a form)
- Collect: name + email (for unique identification), primary goal (multi-select), primary event, experience level, session duration
- Optional fields: best times, pool sessions/week, gym sessions/week
- Flow: conversation → generate → timeline view (default landing). No separate Generate page on first run.
- Time from open to first workout: ~2 minutes.

## App load logic (owner decision, 2026-06-25)
- No profile → show conversational onboarding (collects name + email).
- Profile exists + has today's workout → show today's workout timeline (default landing).
- Profile exists + no workout today → show week view with generate CTA for today.
- Never show onboarding to returning users.

## Week view (owner decision, 2026-06-27)
- Accessible from Today screen (toggle or tab)
- Shows 7 days: past days show completed workout summary, today shows current/upcoming, future days show rest day or scheduled
- Each day is tappable to see that day's full workout
- Visual distinction: completed (sage check), today (coral highlight), future (muted), rest (dashed)

## History view (scoped for v3)
- Accessible from Profile or Week view
- Shows past workouts in reverse chronological order
- Each entry: date, workout name, distance, duration, zone, completion status
- Tap to view full workout details (read-only)
- Stats summary at top: total distance this week, streak, avg distance/workout
- Scope: read-only list + detail view. No editing, no deletion. No feedback mechanism in v3.

## Workout view (owner decision, 2026-025)
- DEFAULT to full workout view (not single-set view). Swimmer sees the whole workout for analysis and coach chat context.
- Toggle between "Full Workout" and "Compact/Execute" views via a [🔲] toggle button.
- Compact/Execute view = single-set, big numbers, swipe between sets, for wet pool deck execution.
- Full workout view = scrollable, all sets visible, per-set coaching notes (💬), "Why this workout" callout, total distance/time.
- Per-set notes are CRITICAL — they explain HOW to swim each set (not just what). Examples: "Hold 1:10/50 pace. If you can't hold it, drop to 1:30." "Descend means each 50 gets faster. Don't sprint first two."
- "Discuss with Coach" button at bottom of full workout view passes full workout context to coach chat.

## Core product insights (panel consensus)
- The workout-in-progress screen IS the real product. Everything else is setup. Default landing should be today's workout.
- One-handed wet pool deck use is non-negotiable: 60px+ tap targets, high contrast, swipe between sets, no scrolling mid-workout.
- Debug mode out of nav (tap logo 5x or ?debug=1).
- Nav restructure: 4 items (Today, Coach, Profile, with Generate as action not destination).
- Profile grows organically from behavior over sessions — not a gate.
- Feedback loop must be instrumented from day one or cut — no faith-based features.

## Visual direction
- "The Pool Deck" (teal + coral, athletic, high contrast, sunlight-legible) as default theme.
- CSS custom properties already support theming — other directions as [data-theme] overrides later.

## Technical notes
- Current app: vanilla JS SPA (~2,353 lines app.js), Express + MongoDB + SurrealDB, LLM orchestration (OpenNotebook RAG + OpenRouter), agentic coach with tool-calling.
- Pool-deck offline use requires PWA (service worker + IndexedDB + background sync) — 1-2 week investment.
- Engineer recommends Preact migration (3KB, same mental model) for long-term maintainability.
- Quick-generate cache path (cached templates for returning users) = highest-impact perf win (3 days of work, transforms feel of app).
- Pace validation guardrail: after generation, check send-offs against best time; regenerate if >20% off.

## Open decisions (owner still needs to make)
1. Primary success metric for v1 (completion rate? return rate? generation-to-completion conversion?)
2. How important is pool-deck offline use at launch?
3. What does "personalized" mean to the owner — matched to level? Adapted to last workout? Reflecting goals?
4. Is the coach a core differentiator or a feature?
5. Business model (affects onboarding, email requirement, premium features)

## Why:
The original 30-field profile form and generic AI output wouldn't serve experienced swimmers who can tell when a workout isn't calibrated to their level. The redesign focuses on credibility-first onboarding and making the workout screen the product.

## How to apply:
When building the redesign, start with the 4-field form + preview screen + workout-in-progress as the core loop. Add offline support and richer personalization as v1.1-v2 enhancements. Always ask: "would an experienced swimmer find this credible?"