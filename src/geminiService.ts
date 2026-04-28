// ─────────────────────────────────────────────────────────────────────────────
// ASTRA AI Service — Direct Groq API calls (works in both browser & APK)
// Using direct API calls removes the dependency on the local Express server,
// which is NOT available inside the APK on the phone.
// Knowledge base from past PDF reports is injected as AI context.
// ─────────────────────────────────────────────────────────────────────────────

import { buildAstraContext, searchKnowledge } from './astraKnowledge';

const GROQ_API_KEY = "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";
const GROQ_BASE = "https://api.groq.com/openai/v1";

/** Internal helper — call Groq chat completions */
async function groqChat(
  messages: { role: string; content: string }[],
  model = "llama-3.1-8b-instant",
  options: { temperature?: number; max_tokens?: number; response_format?: { type: string } } = {}
) {
  const body: any = { model, messages, ...options };

  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content ?? "";
}

// ─── Exported AI Functions ────────────────────────────────────────────────────

/** Chat assistant — used by AIAssistant.tsx */
export async function chatAssistant(messages: any[]) {
  try {
    // Groq expects { role, content } — map and enforce string content
    const groqMessages = messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content),
    }));

    // Smart context: only inject the single most relevant knowledge doc (max 1200 chars)
    // This avoids Groq token limit issues from injecting all 7 PDFs every message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    let knowledgeSnippet = '';
    if (lastUserMsg) {
      const relevant = searchKnowledge(String(lastUserMsg.content), 1);
      if (relevant.length > 0 && relevant[0].text && !relevant[0].text.startsWith('[')) {
        knowledgeSnippet = `\n\nHistorical Reference [${relevant[0].label}]:\n${relevant[0].text.slice(0, 1200)}`;
      }
    }

    const systemContent = `You are A.S.T.R.A., the AI neural core of the ASTRA Solar Car Engineering Platform. You are a precise, professional, and helpful assistant for the solar car team.
- Answer concisely in 2-4 sentences unless detail is explicitly requested.
- Use engineering terminology where relevant.
- If asked about last year's work, designs, costs, or reports, reference the Historical Reference data below.
- If asked about current tasks or progress, say you need live data from the dashboard.${knowledgeSnippet}`;

    const withSystem = [
      { role: "system", content: systemContent },
      ...groqMessages,
    ];

    const reply = await groqChat(withSystem, "llama-3.3-70b-versatile", {
      max_tokens: 1024,
      temperature: 0.7,
    });

    return reply || "A.S.T.R.A. neural link established. Ready for your query.";
  } catch (error: any) {
    console.error("Chat Voice Assistant failed:", error?.message || error);
    const msg = String(error?.message || '');
    if (msg.includes('401')) return "API authentication error. Contact the system administrator.";
    if (msg.includes('429')) return "Rate limit reached. Please wait a moment and try again.";
    return "Neural network connection lost. Please check your internet connection and try again.";
  }
}

/** Voice transcription — uses Groq Whisper endpoint */
export async function transcribeVoice(blob: Blob) {
  try {
    const formData = new FormData();
    formData.append("file", blob, "recording.webm");
    formData.append("model", "whisper-large-v3-turbo");

    const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) throw new Error("Transcription failed");

    const data = await response.json();
    const text: string = data.text?.toLowerCase() ?? "";

    let action = "none";
    if (text.includes("reset system") || text.includes("emergency override")) {
      action = "RESET_SYSTEMS";
    } else if (text.includes("go to dashboard")) {
      action = "NAVIGATE_DASHBOARD";
    } else if (text.includes("go to teams") || text.includes("open teams")) {
      action = "NAVIGATE_TEAMS";
    }

    return { text: data.text, action };
  } catch (error) {
    console.error("Transcription failed:", error);
    return null;
  }
}

/** Summarize notes — AI synthesis */
export async function summarizeNotes(notes: any[]) {
  try {
    const reply = await groqChat(
      [
        {
          role: "system",
          content: "You are the ASTRA Project Intelligence. Technical synthesis specialist.",
        },
        {
          role: "user",
          content: `Summarize these notes concisely: ${JSON.stringify(notes)}`,
        },
      ],
      "llama-3.3-70b-versatile",
      { max_tokens: 300 }
    );
    return reply || "No summary could be generated.";
  } catch (error) {
    console.error("AI Summary failed:", error);
    return "Failed to synchronize AI summary.";
  }
}

/** Generate project schedule */
export async function generateSchedule(raceDate: string) {
  try {
    const reply = await groqChat(
      [
        {
          role: "system",
          content:
            "You are ASTRA AI Scheduler. Generate a JSON schedule with phases array. Each phase: { name, startDate, endDate, tasks: [] }.",
        },
        {
          role: "user",
          content: `Generate a solar car build schedule. Race date: ${raceDate}. Return valid JSON only.` ,
        },
      ],
      "llama-3.1-8b-instant",
      { temperature: 0.3, max_tokens: 800 }
    );
    return JSON.parse(reply || "{}");
  } catch (error) {
    console.error("AI Schedule failed:", error);
    return { phases: [] };
  }
}

/** Innovation suggestions */
export async function getInnovationSuggestions(
  subSystemLogs: any[],
  currentIssues: string[]
) {
  try {
    const reply = await groqChat(
      [
        {
          role: "system",
          content:
            "You are ASTRA Innovation Engine. Provide 3 actionable engineering improvement suggestions based on the subsystem logs and current issues.",
        },
        {
          role: "user",
          content: `Subsystem logs: ${JSON.stringify(subSystemLogs)}\nCurrent issues: ${JSON.stringify(currentIssues)}`,
        },
      ],
      "llama-3.3-70b-versatile",
      { max_tokens: 400, temperature: 0.7 }
    );
    return reply || "Keep pushing boundaries.";
  } catch (error) {
    console.error("AI Innovation failed:", error);
    return "Failed to fetch innovation suggestions.";
  }
}

/** Team performance analysis — returns structured JSON with last-year comparison */
export async function getTeamAnalysis(data: any) {
  try {
    const {
      tasks = [],
      members = [],
      progress = [],
      delays = [],
      subsystem = "General",
      computed_efficiency = "",
      last_year_context = ""
    } = data;

    const systemPrompt = `You are an AI Project Manager for a solar car team competing in SEVC/BSVC.
Analyze the provided telemetry and historical context, then return a strategic assessment.
You MUST use the computed_efficiency value provided directly for the team_efficiency field — do NOT say "Unknown" or "lack of data".
Also compare current work with last year's reports and give a verdict.
CRITICAL FOCUS: You MUST explicitly evaluate and highlight what the team is doing NEW this year compared to last year's car (e.g., new tech, new integration). Say whether the innovation level is HIGHER, SAME, or LOWER than last year.
Return STRICT JSON format only:
{
  "priority_tasks": ["task 1", "task 2"],
  "at_risk_tasks": ["task 3"],
  "blocked_members": ["member name"],
  "team_efficiency": "USE THE COMPUTED VALUE PROVIDED — copy it exactly",
  "recommendations": ["rec 1", "rec 2"],
  "vs_last_year": "2-3 sentences comparing current progress vs last year, explicitly focusing on what is NEW this year in the car.",
  "comparison_verdict": "BETTER or WORSE or SIMILAR",
  "team_summary": "A 1-sentence technical summary of the overall team progress for the current live cycle."
}`;

    const memberList = Array.isArray(members) && members.length > 0
      ? members.join(', ')
      : 'No members assigned yet';

    const userPrompt = `Subsystem: ${subsystem}
Team Members: ${memberList}
Pre-computed Efficiency (USE THIS EXACTLY for team_efficiency): ${computed_efficiency || 'No tasks yet'}
Tasks: ${JSON.stringify(tasks.map(({ id, ...t }: any) => t)).slice(0, 2000)}
Progress: ${JSON.stringify(progress).slice(0, 500)}
Blocked/Critical: ${JSON.stringify(delays.map(({ id, ...t }: any) => t)).slice(0, 500)}

--- LAST YEAR HISTORICAL DATA (for vs_last_year comparison) ---
${last_year_context ? last_year_context.slice(0, 2000) : 'No historical data available'}

Current Date for context: ${new Date().toISOString().split('T')[0]}`;

    const reply = await groqChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      "llama-3.3-70b-versatile",
      { temperature: 0.3, response_format: { type: "json_object" } }
    );

    const parsed = JSON.parse(reply || "{}");
    // Hard guarantee: efficiency is NEVER "unknown" or blank
    const eff = String(parsed.team_efficiency || '');
    if (!eff || eff.toLowerCase().includes('unknown') || eff.toLowerCase().includes('lack') || eff.trim() === '') {
      parsed.team_efficiency = computed_efficiency || 'No tasks yet';
    }
    return parsed;
  } catch (error) {
    console.error("Team AI Analysis failed:", error);
    throw error;
  }
}

/** Task insights summary — Dashboard panel with last-year comparison */
export async function getTaskInsights(tasks: any[], updates: any[], role?: string) {
  try {
    const isCapt = role === "CAPTAIN";
    const lengthGuide = isCapt
      ? "Format your response as a SHORT, CRISP bulleted list. Provide EXACTLY 1 point per task summarizing its status. Include ONE final bullet point comparing current progress to last year's reports."
      : "Format your response as a SHORT, CRISP bulleted list. Provide EXACTLY 1 point per task for your team. Include ONE final bullet point comparing progress to last year's reports.";

    // Strip internal IDs before sending to AI
    const sanitizedTasks = tasks.map(({ id, ...rest }) => rest);

    // Inject historical context for comparison (capped to avoid token overflow)
    const historyContext = buildAstraContext(600);

    const reply = await groqChat(
      [
        {
          role: "system",
          content: `You are ASTRA AI, the project intelligence lead for Team ASTRA solar car.
You have access to last year's SEVC reports as historical reference.
${lengthGuide}
CRITICAL FOCUS: For the final bullet point, compare current progress to last year's reports, focusing on what is NEW this year. State whether innovation is BETTER, WORSE, or SIMILAR.
DO NOT write introductory or concluding paragraphs. ONLY return bullet points starting with "- ". DO NOT include internal database references.`,
        },
        {
          role: "user",
          content: `Current Task Telemetry: ${JSON.stringify({ tasks: sanitizedTasks, updates }).slice(0, 2500)}\n\nLast Year Reference:\n${historyContext}`,
        },
      ],
      "llama-3.1-8b-instant",
      { max_tokens: 300, temperature: 0.7 }
    );

    return reply || "No summary available.";
  } catch (error) {
    console.error("Task insights failed:", error);
    return "Failed to fetch task insights.";
  }
}
