# SKILL
---
name: update-from-prd
description: Reads the [SwimCoach-project](./SwimCoach-project)  codebase and compares it against [PRD.md](./PRD.md) (product requirements document)  to identify gaps, create a phased implementation plan, get human approval, then implement and test the changes. Use this skill whenever the user says things like "update the codebase from the PRD", "implement the PRD changes", "sync the code to the PRD", "the PRD has changed", or "make the app match the PRD". Also triggers when the user edits PRD.md and wants those changes reflected in the code.
---
# Update from PRD
Bridges the gap between an updated [PRD.md](./PRD.md)  and the current [SwimCoach-project](./SwimCoach-project)  codebase.

# Instructions
## Step 1: Gather information and context
1. Read [SwimCoach-project](./SwimCoach-project) to review how the codebase works
  1. **Read the codebase — prioritize in this order:** 1. Top-level directory structure (`SwimCoach-project/`) to understand the project layout 2. Key config files (e.g., `package.json`, `app.json`, any router/nav files) to understand the tech stack and entry points 3. Any existing feature modules or screens relevant to the PRD changes (read selectively — don't read every file, focus on what the PRD touches)	
2. Read [PRD.md](./PRD.md) to identify what new changes were added or removed
  1. - Read the entire file - Note any sections marked as new, changed, or removed - Pay attention to data models, user flows, UI components, and integrations

## Step 2: Formulate a plan
1. Synthesize the information and context you gathered from Step 1 to identify the gaps between the current codebase ([SwimCoach-project](./SwimCoach-project) ) and [PRD.md](./PRD.md) .
  1. **Gap analysis — check for each of the following:** - New features or screens described in PRD.md that don't exist in the codebase - Existing features that need to be modified (changed behavior, renamed, restructured) - Data model changes (new fields, removed fields, changed types) - UI/UX changes (new components, layout changes, navigation changes) - Removed features that should be deleted or disabled - Any integrations or third-party services mentioned in PRD.md not yet wired up
2. Formulate a plan broken down by phases and tasks to update the codebase to resolve the gaps identified
  1. - Organize changes into phases, ordered by dependency (foundational changes first) - Break each phase into discrete, testable tasks - For each task, note: what file(s) are affected, what the change is, and how to verify it works
3. Create a new file in [logs](./logs) name "update-from-prd-tasks" + the current date and time (e.g., `update-from-prd-tasks-2026-06-02T14-30.md`) and add the plan you formulated.
  1. Format:
    1. PRD Update Plan - [date]
    2. Gaps Identified
      1. [list of gaps]
    3. Phase 1: [Name]
      1. Task 1:...
      2. Task 2:...
    4. Phase 2: [Name]
      1. Task 1:...

## Step 3: Human review (required - do not skip)
1. Show the plan in the conversation clearly for the human user to review and request edits and approval before you implement the plan. Never implement the plan without human review and approval first. If the user requests changes, revise the plan and log file, then re-present before proceeding. Include:
  1. Summary of gaps found
  2. The full phased plan
  3. Any ambiguities or decision that need human input.

## Step 4: Implement the plan
1. After approval from the human to implement the plan:
  1. Work through phases in order, task by task'
  2. After completing each task, mark it complete in the log file: change `- [ ]` to `- [x]`
  3. If a task fails or produces unexpected results, pause and surface the issue to the user before continuing.
  4. Do not skip ahead to the next phase until the current phase is fully implemented and tested.

## Step 5: Test the implementation
1. **Task-level testing:** After each task, verify the specific change works as intended (e.g., does the component render? does the data field save correctly?).
2. **Phase-level testing:** After all tasks in a phase are complete, do an end-to-end test of everything that phase touched. Run the app if applicable and walk through the affected flows. 
3. **Final testing:** After all phases are complete, do a full end-to-end test of the entire app. Verify that: - All new features described in PRD.md are present and functional - No previously working features were broken - The app runs without errors 
4. Report test results to the user after each phase and after the final test.