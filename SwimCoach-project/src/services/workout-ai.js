/**
 * Workout AI Service
 *
 * Generates structured workouts by:
 * 1. Querying Open Notebook for relevant training insights from the knowledge base
 * 2. Sending those insights + swimmer profile to OpenRouter's LLM for workout generation
 *
 * This uses OpenRouter directly (not through OpenNotebook) so we get clean
 * structured output that we control, while still leveraging the knowledge base.
 */

const axios = require('axios');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPEN_NOTEBOOK_URL = process.env.OPEN_NOTEBOOK_URL || 'http://localhost:8502';
const OPEN_NOTEBOOK_MODEL = process.env.OPEN_NOTEBOOK_MODEL || '';

// ─── Step 1: Query Open Notebook for knowledge base insights ──────────

async function getTrainingInsights(profile, customization) {
  const prompt = buildInsightsPrompt(profile, customization);
  const modelId = OPEN_NOTEBOOK_MODEL;

  // Use the Open Notebook non-streaming endpoint for a quick knowledge lookup
  const onClient = axios.create({
    baseURL: OPEN_NOTEBOOK_URL,
    timeout: 60_000,
  });

  try {
    const res = await onClient.post('/api/search/ask/simple', {
      question: prompt,
      strategy_model: modelId,
      answer_model: modelId,
      final_answer_model: modelId,
    });
    return res.data?.answer || '';
  } catch {
    // If Open Notebook query fails, return empty — we'll generate without it
    return '';
  }
}

function buildInsightsPrompt(profile, customization) {
  const type = customization.workoutType || profile.goals?.trainingFocus || 'endurance';
  const event = profile.goals?.primaryEvents?.[0];
  const distance = event ? `${event.distance}m ${event.stroke}` : 'general swimming';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;

  return `Find scientific training principles and methodologies for:
- ${type} training for ${distance}
- ${duration} minute session
- ${profile.experienceLevel || 'intermediate'} level swimmer

Return relevant training principles, set structures, interval recommendations, and any scientific findings from the knowledge base. Include source citations.`;
}

// ─── Step 2: Generate structured workout via OpenRouter ───────────────

async function generateWorkout(profile, customization) {
  // Get knowledge base insights first
  const insights = await getTrainingInsights(profile, customization);

  // Build the workout generation prompt
  const systemPrompt = `You are an expert swim coach and exercise scientist. Your task is to generate a structured workout plan as a JSON object.

CRITICAL: Respond with ONLY a valid JSON object. No markdown code blocks, no explanatory text before or after the JSON. Just the raw JSON object starting with { and ending with }. with access to scientific swimming training knowledge. Generate structured, personalized workouts based on the provided knowledge base insights and swimmer profile.

Always respond with valid JSON in this exact structure:
{
  "warmUp": {
    "description": "Detailed warm-up instructions",
    "distance": number (total meters),
    "duration": number (minutes)
  },
  "mainSet": [
    {
      "distancePerRep": number (meters per repetition),
      "reps": number,
      "stroke": "freestyle|backstroke|breaststroke|butterfly|im|kick|drill",
      "restInterval": "e.g., 1:30, 2:00, 15s",
      "focus": "e.g., technique, speed, endurance, power",
      "notes": "Additional instructions"
    }
  ],
  "coolDown": {
    "description": "Detailed cool-down instructions",
    "distance": number (total meters),
    "duration": number (minutes)
  },
  "totalDistance": number (total meters),
  "gymWorkout": {
    "warmUp": { "description": " Gym warm-up", "duration": number },
    "exercises": [
      { "exercise": "name", "sets": number, "reps": number, "restSeconds": number, "muscleGroup": "target muscles", "notes": "form cues" }
    ],
    "coolDown": { "description": "Stretching", "duration": number }
  },
  "trainingNotes": [
    "Scientific principle or rationale 1",
    "Training tip 2",
    "Safety consideration 3"
  ]
}`;

  const userPrompt = buildWorkoutPrompt(profile, customization, insights);

  const response = await axios.post(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      model: 'openrouter/owl-alpha',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      provider: { order: ['openai'], sort: 'throughput' },
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://swimcoach.app',
        'X-Title': 'SwimCoach',
      },
      timeout: 120_000,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from OpenRouter');

  // Try to extract JSON from the response — models sometimes wrap it in markdown
  let jsonStr = content.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Find the first { ... } block if there's extra text
  if (!jsonStr.startsWith('{')) {
    const braceMatch = jsonStr.match(/\{[\s\S]+\}/);
    if (braceMatch) jsonStr = braceMatch[0];
  }

  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('JSON parse error. Raw content:', content.substring(0, 500));
    throw new Error(`Failed to parse workout JSON: ${parseErr.message}`);
  }
}

function buildWorkoutPrompt(profile, customization, insights) {
  const type = customization.workoutType || profile.goals?.trainingFocus || 'endurance';
  const event = profile.goals?.primaryEvents?.[0];
  const distance = event ? `${event.distance}m ${event.stroke}` : 'general';
  const duration = customization.duration || profile.trainingSchedule?.sessionDuration || 60;
  const poolLength = customization.poolLength || profile.equipment?.poolLength || 25;

  const parts = [
    `Generate a ${type} workout for the following swimmer:`,
    '',
    `## Swimmer Profile`,
    `- Name: ${profile.firstName} ${profile.lastName}`,
    `- Level: ${profile.experienceLevel || 'intermediate'}`,
    `- Primary event: ${distance}`,
    `- Training focus: ${type}`,
    `- Session duration: ${duration} minutes`,
    `- Pool length: ${poolLength}m`,
    `- Pool sessions/week: ${profile.trainingSchedule?.weeklyPoolSessions || 3}`,
    `- Gym sessions/week: ${profile.trainingSchedule?.weeklyGymSessions || 2}`,
  ];

  if (profile.bestTimes?.length) {
    parts.push(`- Best times: ${profile.bestTimes.map(t => `${t.distance}m ${t.stroke}: ${t.time}`).join(', ')}`);
  }

  if (profile.goals?.targetImprovement) {
    parts.push(`- Goal: ${profile.goals.targetImprovement}`);
  }

  // Equipment
  const poolGear = Object.entries(profile.equipment?.poolEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  const gymGear = Object.entries(profile.equipment?.gymEquipment || {}).filter(([, v]) => v).map(([k]) => k);
  if (poolGear.length) parts.push(`- Pool equipment: ${poolGear.join(', ')}`);
  if (gymGear.length) parts.push(`- Gym equipment: ${gymGear.join(', ')}`);

  if (customization.intensity) parts.push(`- Intensity: ${customization.intensity}`);

  parts.push('');

  // Knowledge base insights
  if (insights && insights !== 'No answer generated') {
    parts.push('## Knowledge Base Insights');
    parts.push(insights);
    parts.push('');
  }

  parts.push('## Requirements');
  parts.push(`- Total workout time: ${duration} minutes (including warm-up and cool-down)`);
  parts.push(`- Use ${poolLength}m pool for calculations`);
  parts.push('- Include specific distances, reps, rest intervals, and target paces');
  parts.push('- Add a brief gym session (15-20 min) if gym equipment is available');
  parts.push('- Provide 3-5 training notes with scientific rationale');
  parts.push('- Return ONLY valid JSON, no other text');

  return parts.join('\n');
}

module.exports = {
  generateWorkout,
  getTrainingInsights,
};
