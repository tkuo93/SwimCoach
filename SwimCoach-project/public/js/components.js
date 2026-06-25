/**
 * SwimCoach UI Components
 * Pure functions that return DOM elements or HTML strings.
 *
 * NOTE: Functions are declared at the top level and imported via ES modules.
 */

// ─── ES Module Exports (must be at end of file) ───
export {
  showToast,
  showLoading,
  hideLoading,
  setActiveNav,
  showPage,
  getTypeLabel,
  buildWorkoutCard,
  buildWorkoutEditForm,
  buildChatPanel,
  addChatMessage,
  buildFeedbackForm,
  showAdaptiveResponse,
  buildEmptyState,
  escapeHtml,
  capitalize,
  formatDate,
  formatDateInput,
};

// ─── Toast Notifications ───

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── Loading Overlay ───

function showLoading(text = 'Loading…') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ─── Navigation ───

function setActiveNav(page) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === page);
  });
}

// ─── Page Visibility ───

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${pageId}`).classList.remove('hidden');
}

// ─── Workout Type Badge ───

const workoutTypeLabels = {
  lactate: 'Lactate Threshold',
  'resistance-power': 'Resistance / Power',
  speed: 'Speed',
  technique: 'Technique',
  endurance: 'Endurance',
  recovery: 'Recovery',
};

function getTypeLabel(type) {
  return workoutTypeLabels[type] || type;
}

// ─── Build Workout Card ───

function buildWorkoutCard(workout) {
  if (!workout) {
    return `
      <div class="empty-state">
        <span class="emoji">🏊</span>
        <h3>No workout loaded</h3>
        <p>Generate a workout to get started.</p>
      </div>`;
  }

  const w = workout;
  const pool = w.poolWorkout || {};
  const gym = w.gymWorkout || {};
  const hasPoolContent = pool.mainSet?.length || pool.warmUp?.description || pool.coolDown?.description;
  const hasGymContent = gym.mainSet?.length || gym.warmUp?.description || gym.coolDown?.description;
  const hasNotes = w.trainingNotes?.length || pool.trainingNotes?.length || gym.trainingNotes?.length;
  const rawDescription = pool.warmUp?.description || '';

  // If no structured content was parsed, show the raw RAG output
  if (!hasPoolContent && !hasGymContent && !hasNotes && rawDescription && rawDescription !== 'No answer generated') {
    return `
      <div class="workout-card">
        <div class="workout-header">
          <h2>${escapeHtml(w.workoutName || 'Workout')}</h2>
          <div class="workout-meta">
            <span class="badge badge-type">${getTypeLabel(w.workoutType)}</span>
            <span class="badge badge-intensity badge-intensity-${w.intensity || 'moderate'}">${capitalize(w.intensity || 'moderate')}</span>
            <span class="badge badge-date badge-date-clickable" title="Click to edit date">📅 ${formatDate(w.date || w.createdAt)}</span>
          </div>
        </div>
        <div class="workout-section">
          <h3><span class="icon">📝</span> Workout Description</h3>
          <div style="white-space: pre-wrap; line-height: 1.7; color: var(--gray-700); font-size: 0.95rem;">${escapeHtml(rawDescription)}</div>
        </div>
      </div>`;
  }

  // If truly empty (no content at all)
  if (!hasPoolContent && !hasGymContent && !hasNotes) {
    return `
      <div class="workout-card">
        <div class="workout-header">
          <h2>${escapeHtml(w.workoutName || 'Workout')}</h2>
          <div class="workout-meta">
            <span class="badge badge-type">${getTypeLabel(w.workoutType)}</span>
            <span class="badge badge-intensity badge-intensity-${w.intensity || 'moderate'}">${capitalize(w.intensity || 'moderate')}</span>
            <span class="badge badge-date badge-date-clickable" title="Click to edit date">📅 ${formatDate(w.date || w.createdAt)}</span>
          </div>
        </div>
        <div class="workout-section">
          <div class="empty-state" style="padding: var(--space-xl);">
            <span class="emoji">🤔</span>
            <h3>No structured workout generated</h3>
            <p>The AI coach couldn't generate a structured workout this time. Try regenerating or adjusting your preferences.</p>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="workout-card">
      <div class="workout-header">
        <h2>${escapeHtml(w.workoutName || 'Workout')}</h2>
        <div class="workout-meta">
          <span class="badge badge-type">${getTypeLabel(w.workoutType)}</span>
          <span class="badge badge-intensity badge-intensity-${w.intensity || 'moderate'}">${capitalize(w.intensity || 'moderate')}</span>
          <span class="badge badge-date badge-date-clickable" title="Click to edit date">📅 ${formatDate(w.date || w.createdAt)}</span>
        </div>
      </div>

      ${buildPoolSection(pool)}
      ${buildGymSection(gym)}
      ${!pool.trainingNotes?.length && !gym.trainingNotes?.length ? buildTrainingNotes(w.trainingNotes) : ''}
    </div>`;
}

// ─── Build Workout Edit Form ───

function buildWorkoutEditForm(workout) {
  const w = workout;
  const pool = w.poolWorkout || {};
  const gym = w.gymWorkout || {};

  const poolMainSetRows = (pool.mainSet || []).map((set, i) => `
    <tr class="edit-set-row" data-set-index="${i}" data-set-type="pool">
      <td><input type="number" class="edit-input edit-reps" value="${set.repetitions || 1}" min="1" title="Reps"></td>
      <td><input type="number" class="edit-input edit-distance" value="${set.distance || 0}" min="0" title="Distance (${pool.poolUnit === 'yards' ? 'yd' : 'm'})"></td>
      <td><input type="text" class="edit-input edit-stroke" value="${escapeHtml(set.stroke || 'freestyle')}" title="Stroke"></td>
      <td><input type="text" class="edit-input edit-interval" value="${escapeHtml(set.interval || '')}" title="Interval (e.g. 1:30)"></td>
      <td><input type="text" class="edit-input edit-focus" value="${escapeHtml(set.focus || '')}" title="Focus"></td>
      <td><input type="text" class="edit-input edit-set-notes" value="${escapeHtml(set.description || '')}" title="Notes"></td>
      <td><button type="button" class="btn btn-sm btn-danger btn-remove-set" title="Remove set">✕</button></td>
    </tr>
  `).join('');

  const gymMainSetRows = (gym.mainSet || []).map((ex, i) => `
    <tr class="edit-set-row" data-set-index="${i}" data-set-type="gym">
      <td><input type="text" class="edit-input edit-exercise" value="${escapeHtml(ex.exercise || '')}" title="Exercise"></td>
      <td><input type="number" class="edit-input edit-sets" value="${ex.sets || 1}" min="1" title="Sets"></td>
      <td><input type="number" class="edit-input edit-reps" value="${ex.repetitions || 1}" min="1" title="Reps"></td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;">
          <input type="number" class="edit-input edit-weight" value="${ex.weight || 0}" min="0" title="Weight" style="width:60px;">
          <select class="edit-input edit-weight-unit" title="Unit" style="width:55px;">
            <option value="">—</option>
            <option value="lbs" ${ex.weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
            <option value="kg" ${ex.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
          </select>
        </div>
      </td>
      <td><input type="number" class="edit-input edit-rest" value="${ex.restTime || 0}" min="0" title="Rest (sec)"></td>
      <td><input type="text" class="edit-input edit-muscle" value="${escapeHtml(ex.muscleGroup || '')}" title="Muscle group"></td>
      <td><button type="button" class="btn btn-sm btn-danger btn-remove-set" title="Remove set">✕</button></td>
    </tr>
  `).join('');

  const trainingNotes = (w.trainingNotes || []).map(n => escapeHtml(n)).join('\n');
  const poolTrainingNotes = ((w.poolWorkout || {}).trainingNotes || []).map(n => escapeHtml(n)).join('\n');
  const gymTrainingNotes = ((w.gymWorkout || {}).trainingNotes || []).map(n => escapeHtml(n)).join('\n');

  return `
    <div class="workout-edit-form" id="workout-edit-form-${w._id}">
      <div class="edit-section">
        <h3>Workout Details</h3>
        <div class="edit-grid">
          <div class="form-group">
            <label for="edit-name-${w._id}">Title</label>
            <input type="text" id="edit-name-${w._id}" class="edit-input-full" value="${escapeHtml(w.workoutName || 'Workout')}">
          </div>
          <div class="form-group">
            <label for="edit-type-${w._id}">Type</label>
            <select id="edit-type-${w._id}">
              ${['lactate','resistance-power','speed','technique','endurance','recovery','mobility'].map(t =>
                `<option value="${t}" ${w.workoutType === t ? 'selected' : ''}>${getTypeLabel(t)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="edit-duration-${w._id}">Duration (min)</label>
            <input type="number" id="edit-duration-${w._id}" value="${w.duration || 60}" min="10" max="180">
          </div>
          <div class="form-group">
            <label for="edit-intensity-${w._id}">Intensity</label>
            <select id="edit-intensity-${w._id}">
              ${['low','moderate','high','maximal'].map(i =>
                `<option value="${i}" ${w.intensity === i ? 'selected' : ''}>${capitalize(i)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="edit-date-${escapeHtml(w._id)}">Scheduled Date</label>
            <input type="date" id="edit-date-${escapeHtml(w._id)}" value="${escapeHtml(formatDateInput(w.date || w.createdAt))}">
          </div>
        </div>
      </div>

      <div class="edit-section">
        <h3>🏊 Pool — Warm-up</h3>
        <div class="edit-grid">
          <div class="form-group">
            <label>Distance (${pool.poolUnit === 'yards' ? 'yd' : 'm'})</label>
            <input type="number" id="edit-pool-wu-dist-${w._id}" value="${pool.warmUp?.distance || 0}" min="0">
          </div>
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" id="edit-pool-wu-dur-${w._id}" value="${pool.warmUp?.duration || 0}" min="0">
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label>Description</label>
            <textarea id="edit-pool-wu-desc-${w._id}" rows="2">${escapeHtml(pool.warmUp?.description || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="edit-section">
        <h3>🏊 Pool — Main Sets</h3>
        <table class="interval-table edit-table">
          <thead><tr><th>Reps</th><th>Dist (${pool.poolUnit === 'yards' ? 'yd' : 'm'})</th><th>Stroke</th><th>Interval</th><th>Focus</th><th>Notes</th><th></th></tr></thead>
          <tbody id="edit-pool-sets-${w._id}">
            ${poolMainSetRows || '<tr><td colspan="7" class="text-muted">No sets — add one below</td></tr>'}
          </tbody>
        </table>
        <button type="button" class="btn btn-sm btn-secondary btn-add-set" data-pool="true" data-workout-id="${w._id}">+ Add Pool Set</button>
      </div>

      <div class="edit-section">
        <h3>🏊 Pool — Cool-down</h3>
        <div class="edit-grid">
          <div class="form-group">
            <label>Distance (${pool.poolUnit === 'yards' ? 'yd' : 'm'})</label>
            <input type="number" id="edit-pool-cd-dist-${w._id}" value="${pool.coolDown?.distance || 0}" min="0">
          </div>
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" id="edit-pool-cd-dur-${w._id}" value="${pool.coolDown?.duration || 0}" min="0">
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label>Description</label>
            <textarea id="edit-pool-cd-desc-${w._id}" rows="2">${escapeHtml(pool.coolDown?.description || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="edit-section">
        <h3>💪 Gym — Warm-up</h3>
        <div class="edit-grid">
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" id="edit-gym-wu-dur-${w._id}" value="${gym.warmUp?.duration || 0}" min="0">
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label>Description</label>
            <textarea id="edit-gym-wu-desc-${w._id}" rows="2">${escapeHtml(gym.warmUp?.description || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="edit-section">
        <h3>💪 Gym — Exercises</h3>
        <table class="interval-table edit-table">
          <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight (kg)</th><th>Rest (s)</th><th>Muscle</th><th></th></tr></thead>
          <tbody id="edit-gym-sets-${w._id}">
            ${gymMainSetRows || '<tr><td colspan="7" class="text-muted">No exercises — add one below</td></tr>'}
          </tbody>
        </table>
        <button type="button" class="btn btn-sm btn-secondary btn-add-set" data-pool="false" data-workout-id="${w._id}">+ Add Gym Exercise</button>
      </div>

      <div class="edit-section">
        <h3>💪 Gym — Cool-down</h3>
        <div class="edit-grid">
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" id="edit-gym-cd-dur-${w._id}" value="${gym.coolDown?.duration || 0}" min="0">
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label>Description</label>
            <textarea id="edit-gym-cd-desc-${w._id}" rows="2">${escapeHtml(gym.coolDown?.description || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="edit-section">
        <h3>🧠 Training Notes</h3>
        ${poolTrainingNotes || gymTrainingNotes ? `
          ${poolTrainingNotes ? `<div class="form-group"><label>🏊 Pool Notes</label><textarea id="edit-pool-notes-${w._id}" rows="2" placeholder="One note per line">${poolTrainingNotes}</textarea></div>` : ''}
          ${gymTrainingNotes ? `<div class="form-group"><label>💪 Gym Notes</label><textarea id="edit-gym-notes-${w._id}" rows="2" placeholder="One note per line">${gymTrainingNotes}</textarea></div>` : ''}
        ` : `
          <div class="form-group">
            <textarea id="edit-notes-${w._id}" rows="3" placeholder="One note per line">${trainingNotes}</textarea>
          </div>
        `}
      </div>

      <div class="edit-actions">
        <button type="button" class="btn btn-primary btn-save-edit" data-workout-id="${w._id}">💾 Save Changes</button>
        <button type="button" class="btn btn-secondary btn-cancel-edit" data-workout-id="${w._id}">Cancel</button>
      </div>
    </div>`;
}

function buildPoolSection(pool) {
  if (!pool || (!pool.warmUp && !pool.mainSet?.length && !pool.coolDown)) return '';

  const unit = pool.poolUnit === 'yards' ? 'yd' : 'm';

  const mainSetRows = (pool.mainSet || []).map(set => `
    <tr>
      <td class="reps">${set.repetitions}&times;</td>
      <td class="distance">${set.distance}${unit}</td>
      <td>${escapeHtml(set.stroke || 'freestyle')}</td>
      <td>${escapeHtml(set.interval || '—')}</td>
      <td>${escapeHtml(set.focus || '—')}</td>
      <td>${escapeHtml(set.description || '')}</td>
    </tr>
  `).join('');

  return `
    <div class="workout-section">
      <h3><span class="icon">🏊</span> Pool — ${pool.totalDistance || 0}${unit}</h3>
      ${pool.warmUp?.description ? `<p style="margin-bottom:1rem;color:var(--gray-600);font-size:0.9rem;"><strong>Warm-up:</strong> ${escapeHtml(pool.warmUp.description)}${pool.warmUp.distance ? ` (${pool.warmUp.distance}${unit})` : ''}</p>` : ''}
      ${mainSetRows ? `
        <table class="interval-table">
          <thead><tr><th>Reps</th><th>Dist</th><th>Stroke</th><th>Interval</th><th>Focus</th><th>Notes</th></tr></thead>
          <tbody>${mainSetRows}</tbody>
        </table>` : ''}
      <div class="section-summary">
        <span>Total: <strong>${pool.totalDistance || 0}${unit}</strong></span>
        ${pool.warmUp?.duration ? `<span>Warm-up: ${pool.warmUp.duration}min</span>` : ''}
        ${pool.coolDown?.duration ? `<span>Cool-down: ${pool.coolDown.duration}min</span>` : ''}
      </div>
      ${pool.coolDown?.description ? `<p style="margin-top:0.75rem;color:var(--gray-600);font-size:0.9rem;"><strong>Cool-down:</strong> ${escapeHtml(pool.coolDown.description)}${pool.coolDown.distance ? ` (${pool.coolDown.distance}${unit})` : ''}</p>` : ''}
      ${buildSectionNotes(pool.trainingNotes)}
    </div>`;
}

function buildGymSection(gym) {
  if (!gym || (!gym.warmUp && !gym.mainSet?.length && !gym.coolDown)) return '';

  const mainSetRows = (gym.mainSet || []).map(ex => `
    <tr>
      <td><strong>${escapeHtml(ex.exercise)}</strong></td>
      <td class="reps">${ex.sets}&times;${ex.repetitions}</td>
      <td>${ex.weight ? `${ex.weight}${ex.weightUnit || 'kg'}` : '—'}</td>
      <td>${ex.restTime ? `${ex.restTime}s rest` : '—'}</td>
      <td>${escapeHtml(ex.muscleGroup || '—')}</td>
    </tr>
  `).join('');

  return `
    <div class="workout-section">
      <h3><span class="icon">💪</span> Gym</h3>
      ${gym.warmUp?.description ? `<p style="margin-bottom:1rem;color:var(--gray-600);font-size:0.9rem;"><strong>Warm-up:</strong> ${escapeHtml(gym.warmUp.description)}${gym.warmUp.duration ? ` (${gym.warmUp.duration}min)` : ''}</p>` : ''}
      ${mainSetRows ? `
        <table class="interval-table">
          <thead><tr><th>Exercise</th><th>Sets × Reps</th><th>Weight</th><th>Rest</th><th>Muscle</th></tr></thead>
          <tbody>${mainSetRows}</tbody>
        </table>` : ''}
      ${gym.coolDown?.description ? `<p style="margin-top:0.75rem;color:var(--gray-600);font-size:0.9rem;"><strong>Cool-down:</strong> ${escapeHtml(gym.coolDown.description)}${gym.coolDown.duration ? ` (${gym.coolDown.duration}min)` : ''}</p>` : ''}
      ${buildSectionNotes(gym.trainingNotes)}
    </div>`;
}

function buildSectionNotes(notes) {
  if (!notes?.length) return '';
  const items = notes.map(n => `<li>${escapeHtml(n)}</li>`).join('');
  return `
    <div class="training-notes-inline">
      <ul class="training-notes">${items}</ul>
    </div>`;
}

function buildTrainingNotes(notes) {
  // Fallback for legacy workouts that store notes at root level
  if (!notes?.length) return '';
  const items = notes.map(n => `<li>${escapeHtml(n)}</li>`).join('');
  return `
    <div class="workout-section">
      <h3><span class="icon">🧠</span> Training Notes</h3>
      <ul class="training-notes">${items}</ul>
    </div>`;
}

// ─── Build Chat Panel ───

function buildChatPanel(workoutId) {
  return `
    <div class="chat-panel" id="chat-panel-${workoutId}">
      <h3>💬 Chat with your coach</h3>
      <div class="chat-messages" id="chat-messages-${workoutId}">
        <!-- Populated dynamically by conversation handler -->
      </div>
      <form class="chat-input-form" id="chat-form-${workoutId}">
        <input type="text" placeholder="Ask about your workout or request changes…" id="chat-input-${workoutId}" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-sm">Send</button>
      </form>
    </div>`;
}

function addChatMessage(workoutId, text, sender) {
  const container = document.getElementById(`chat-messages-${workoutId}`);
  if (!container) return;
  const msg = document.createElement('div');
  msg.className = `chat-message ${sender}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

// ─── Build Feedback Form ───

function buildFeedbackForm(workoutId, existingFeedback) {
  const rating = existingFeedback?.rating || 0;
  const difficulty = existingFeedback?.difficultyPerception || '';
  const enjoyment = existingFeedback?.enjoyment || '';
  const quality = existingFeedback?.quality || '';
  const accuracy = existingFeedback?.accuracy || '';

  return `
    <div class="feedback-panel" id="feedback-panel-${workoutId}">
      <h3>📝 How was this workout?</h3>
      <form id="feedback-form-${workoutId}">
        <div class="feedback-grid">
          <div class="form-group">
            <label>Rating</label>
            <div class="star-rating" id="star-rating-${workoutId}">
              ${[1,2,3,4,5].map(n => `<span class="star ${n <= rating ? 'active' : ''}" data-value="${n}">★</span>`).join('')}
            </div>
            <input type="hidden" name="rating" id="rating-input-${workoutId}" value="${rating}">
          </div>
          <div class="form-group">
            <label for="difficulty-${workoutId}">Difficulty</label>
            <select id="difficulty-${workoutId}" name="difficultyPerception">
              <option value="">Select…</option>
              ${['too-easy','easy','just-right','hard','too-hard'].map(v =>
                `<option value="${v}" ${difficulty === v ? 'selected' : ''}>${capitalize(v.replace('-', ' '))}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="enjoyment-${workoutId}">Enjoyment</label>
            <select id="enjoyment-${workoutId}" name="enjoyment">
              <option value="">Select…</option>
              ${['did-not-enjoy','neutral','enjoyed','loved'].map(v =>
                `<option value="${v}" ${enjoyment === v ? 'selected' : ''}>${capitalize(v.replace(/-/g, ' '))}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="quality-${workoutId}">Quality</label>
            <select id="quality-${workoutId}" name="quality">
              <option value="">Select…</option>
              ${['poor','below-average','average','good','excellent'].map(v =>
                `<option value="${v}" ${quality === v ? 'selected' : ''}>${capitalize(v.replace(/-/g, ' '))}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="accuracy-${workoutId}">Accuracy</label>
            <select id="accuracy-${workoutId}" name="accuracy">
              <option value="">Select…</option>
              ${['way-off','close-but-off','mostly-accurate','spot-on'].map(v =>
                `<option value="${v}" ${accuracy === v ? 'selected' : ''}>${capitalize(v.replace(/-/g, ' '))}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="comments-${workoutId}">Comments (optional)</label>
          <textarea id="comments-${workoutId}" name="comments" rows="2" placeholder="What worked? What didn't?">${escapeHtml(existingFeedback?.comments || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Submit Feedback</button>
        </div>
      </form>
      <div id="adaptive-response-${workoutId}" class="adaptive-response hidden"></div>
    </div>`;
}

function showAdaptiveResponse(workoutId, feedback) {
  const container = document.getElementById(`adaptive-response-${workoutId}`);
  if (!container) return;

  let emoji = '💪';
  let message = "Thanks for the feedback! I'll keep this in mind for your next workout.";

  if (feedback.difficultyPerception === 'too-hard' || feedback.rating <= 2) {
    emoji = '😅';
    message = "Got it — that was a tough one. I'll dial it back a bit for your next workout.";
  } else if (feedback.difficultyPerception === 'too-easy' || feedback.rating >= 5) {
    emoji = '🔥';
    message = "You crushed it! I'll push you a little harder next time.";
  } else if (feedback.difficultyPerception === 'just-right') {
    emoji = '✅';
    message = "Perfect — right in the sweet spot. I'll keep the intensity at this level and build from here.";
  } else if (feedback.enjoyment === 'loved') {
    emoji = '❤️';
    message = "So glad you loved it! I'll use this as a template for future workouts.";
  } else if (feedback.enjoyment === 'did-not-enjoy') {
    emoji = '🤔';
    message = "Thanks for being honest. I'll try a different approach next time — more variety coming your way.";
  }

  container.innerHTML = `<span class="emoji">${emoji}</span><p>${message}</p>`;
  container.classList.remove('hidden');
}

// ─── Build Empty State ───

function buildEmptyState(emoji, title, message, action) {
  return `
    <div class="empty-state">
      <span class="emoji">${emoji}</span>
      <h3>${title}</h3>
      <p>${message}</p>
      ${action || ''}
    </div>`;
}

// ─── Helpers ───

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  // Use UTC to match how dates are stored and avoid timezone-induced off-by-one
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDateInput(dateStr) {
  if (!dateStr) return '';
  // Parse as UTC to avoid timezone shifts (dates from API are ISO/UTC strings)
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
