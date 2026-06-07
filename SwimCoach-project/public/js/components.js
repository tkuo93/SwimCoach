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
  buildChatPanel,
  addChatMessage,
  buildFeedbackForm,
  showAdaptiveResponse,
  buildEmptyState,
  escapeHtml,
  capitalize,
  formatDate,
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
  const hasNotes = w.trainingNotes?.length;
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
            <span class="badge badge-date">${formatDate(w.date || w.createdAt)}</span>
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
            <span class="badge badge-date">${formatDate(w.date || w.createdAt)}</span>
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
          <span class="badge badge-date">${formatDate(w.date || w.createdAt)}</span>
        </div>
      </div>

      ${buildPoolSection(pool)}
      ${buildGymSection(gym)}
      ${buildTrainingNotes(w.trainingNotes)}
    </div>`;
}

function buildPoolSection(pool) {
  if (!pool || (!pool.warmUp && !pool.mainSet?.length && !pool.coolDown)) return '';

  const mainSetRows = (pool.mainSet || []).map(set => `
    <tr>
      <td class="reps">${set.repetitions}&times;</td>
      <td class="distance">${set.distance}m</td>
      <td>${escapeHtml(set.stroke || 'freestyle')}</td>
      <td>${escapeHtml(set.interval || '—')}</td>
      <td>${escapeHtml(set.focus || '—')}</td>
      <td>${escapeHtml(set.description || '')}</td>
    </tr>
  `).join('');

  return `
    <div class="workout-section">
      <h3><span class="icon">🏊</span> Pool — ${pool.totalDistance || 0}m</h3>
      ${pool.warmUp?.description ? `<p style="margin-bottom:1rem;color:var(--gray-600);font-size:0.9rem;"><strong>Warm-up:</strong> ${escapeHtml(pool.warmUp.description)}${pool.warmUp.distance ? ` (${pool.warmUp.distance}m)` : ''}</p>` : ''}
      ${mainSetRows ? `
        <table class="interval-table">
          <thead><tr><th>Reps</th><th>Dist</th><th>Stroke</th><th>Interval</th><th>Focus</th><th>Notes</th></tr></thead>
          <tbody>${mainSetRows}</tbody>
        </table>` : ''}
      <div class="section-summary">
        <span>Total: <strong>${pool.totalDistance || 0}m</strong></span>
        ${pool.warmUp?.duration ? `<span>Warm-up: ${pool.warmUp.duration}min</span>` : ''}
        ${pool.coolDown?.duration ? `<span>Cool-down: ${pool.coolDown.duration}min</span>` : ''}
      </div>
      ${pool.coolDown?.description ? `<p style="margin-top:0.75rem;color:var(--gray-600);font-size:0.9rem;"><strong>Cool-down:</strong> ${escapeHtml(pool.coolDown.description)}</p>` : ''}
    </div>`;
}

function buildGymSection(gym) {
  if (!gym || (!gym.warmUp && !gym.mainSet?.length && !gym.coolDown)) return '';

  const mainSetRows = (gym.mainSet || []).map(ex => `
    <tr>
      <td><strong>${escapeHtml(ex.exercise)}</strong></td>
      <td class="reps">${ex.sets}&times;${ex.repetitions}</td>
      <td>${ex.weight ? `${ex.weight}kg` : '—'}</td>
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
    </div>`;
}

function buildTrainingNotes(notes) {
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
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
