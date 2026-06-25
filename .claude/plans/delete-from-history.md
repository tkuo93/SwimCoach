# Plan: Add Delete Button to History Cards

## Summary
Add a delete button to each workout card in the history list so users can delete workouts without navigating to the detail page first.

## What Changes

### 1. `public/js/app.js` — Add delete button + handler in `loadHistoryPage()`

**In the history card template** (line ~1518-1522), add a Delete button alongside View/Edit:
```html
<button type="button" class="btn btn-sm btn-danger btn-delete-workout" data-id="${w._id}">Delete</button>
```

**In the click handlers section** (after line ~1536), add:
```js
container.querySelectorAll('.btn-delete-workout').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = btn.dataset.id;
    if (confirm('Delete this workout? This cannot be undone.')) {
      deleteWorkout(id);
    }
  });
});
```

This reuses the existing `deleteWorkout()` function (line 1245) which already handles the API call, loading overlay, toast, and navigation back to `#history`.

### 2. No API changes needed
`DELETE /api/workouts/:id` already exists with ownership verification.

### 3. No CSS changes needed
The `.btn-danger` class already exists (line 1196) and provides red styling. The `.history-card-actions` flex container will naturally include the new button.

## Files Modified
- `SwimCoach-project/public/js/app.js` — history card template + click handler

## Verification
1. Navigate to `#history`
2. Confirm each workout card now shows a red "Delete" button
3. Click Delete → confirm dialog → workout removed from list
4. Cancel dialog → workout stays
