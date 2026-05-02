// ─────────────────────────────────────────────────────────────────────────────
// ASTRA AI Service — Backend API Bridge
// ─────────────────────────────────────────────────────────────────────────────

/** Internal helper — call Backend AI endpoints */
async function callBackendAI(endpoint: string, body: any) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error ${response.status}: ${err}`);
  }

  return await response.json();
}

// ─── Exported AI Functions ────────────────────────────────────────────────────

/** Chat assistant — used by AIAssistant.tsx */
export async function chatAssistant(messages: any[]) {
  try {
    const result = await callBackendAI("/api/chat", { messages });
    return result.message || "A.S.T.R.A. neural link established. Ready for your query.";
  } catch (error: any) {
    console.error("AI Chat failed:", error);
    return "Neural network connection lost. Check your internet connection.";
  }
}

/** Voice transcription — uses Groq Whisper via backend (planned) */
export async function transcribeVoice(blob: Blob) {
  // Currently frontend only for quick prototyping, can be moved to backend if needed
  console.log("Voice transcription requested...");
  return null;
}

/** Summarize notes — AI synthesis */
export async function summarizeNotes(notes: any[]) {
  try {
    const result = await callBackendAI("/api/summarize", { notes });
    return result.summary || "No summary could be generated.";
  } catch (error) {
    console.error("AI Summary failed:", error);
    return "Failed to synchronize AI summary.";
  }
}

/** Generate project schedule */
export async function generateSchedule(raceDate: string) {
  try {
    const result = await callBackendAI("/api/ai/analyze", {
      systemPrompt: "You are ASTRA AI Scheduler. Generate a JSON schedule with phases array. Each phase: { name, startDate, endDate, tasks: [] }.",
      userPrompt: `Generate a solar car build schedule. Race date: ${raceDate}. Return valid JSON only.`,
      model: "llama-3.1-8b-instant"
    });
    return result || { phases: [] };
  } catch (error) {
    console.error("AI Schedule failed:", error);
    return { phases: [] };
  }
}

/** Innovation suggestions */
export async function getInnovationSuggestions(subSystemLogs: any[], currentIssues: string[]) {
  try {
    const result = await callBackendAI("/api/chat", {
      messages: [
        { role: "system", content: "You are ASTRA Innovation Engine. Provide 3 actionable engineering improvement suggestions." },
        { role: "user", content: `Subsystem logs: ${JSON.stringify(subSystemLogs)}\nCurrent issues: ${JSON.stringify(currentIssues)}` }
      ]
    });
    return result.message || "Keep pushing boundaries.";
  } catch (error) {
    console.error("AI Innovation failed:", error);
    return "Failed to fetch innovation suggestions.";
  }
}

/** Team performance analysis — returns structured JSON */
export async function getTeamAnalysis(data: any) {
  try {
    const result = await callBackendAI("/api/ai/team-analysis", data);
    return result;
  } catch (error) {
    console.error("Team AI Analysis failed:", error);
    throw error;
  }
}

/** Task insights summary — Dashboard panel */
export async function getTaskInsights(tasks: any[], updates: any[], role?: string) {
  try {
    const result = await callBackendAI("/api/analyze", {
      type: 'TASK_PROGRESS',
      data: { tasks, updates },
      context: role === 'CAPTAIN' ? 'Captain/Admin View' : 'Team Member View'
    });
    return result.analysis || "No summary available.";
  } catch (error) {
    console.error("Task insights failed:", error);
    return "Failed to fetch task insights.";
  }
}
