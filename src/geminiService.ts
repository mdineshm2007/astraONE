// ─────────────────────────────────────────────────────────────────────────────
// ASTRA AI Service — Backend API Bridge with Live Data Context
// ─────────────────────────────────────────────────────────────────────────────

import { ref, get } from 'firebase/database';
import { rtdb } from './firebase';

/** Fetch live app data from Firebase for AI context */
async function fetchLiveContext(): Promise<Record<string, any>> {
  try {
    const [tasksSnap, usersSnap, subsystemsSnap, financesSnap] = await Promise.all([
      get(ref(rtdb, 'tasks')),
      get(ref(rtdb, 'users')),
      get(ref(rtdb, 'subsystems')),
      get(ref(rtdb, 'finances')),
    ]);

    const tasks = tasksSnap.exists() ? Object.entries(tasksSnap.val()).map(([id, v]: any) => ({ id, ...v })) : [];
    const users = usersSnap.exists() ? Object.entries(usersSnap.val()).map(([id, v]: any) => ({ id, ...v })) : [];
    const subsystems = subsystemsSnap.exists() ? subsystemsSnap.val() : {};
    const finances = financesSnap.exists() ? financesSnap.val() : {};

    // Summarize tasks by status
    const taskSummary = {
      total: tasks.length,
      completed: tasks.filter((t: any) => t.status === 'COMPLETED').length,
      inProgress: tasks.filter((t: any) => t.status === 'IN_PROGRESS').length,
      pending: tasks.filter((t: any) => t.status === 'PENDING').length,
      blocked: tasks.filter((t: any) => t.status === 'BLOCKED').length,
      critical: tasks.filter((t: any) => t.priority === 'CRITICAL').length,
      bySubsystem: tasks.reduce((acc: any, t: any) => {
        if (!acc[t.subsystem]) acc[t.subsystem] = { total: 0, completed: 0, pending: 0, inProgress: 0, blocked: 0 };
        acc[t.subsystem].total++;
        if (t.status === 'COMPLETED') acc[t.subsystem].completed++;
        if (t.status === 'PENDING') acc[t.subsystem].pending++;
        if (t.status === 'IN_PROGRESS') acc[t.subsystem].inProgress++;
        if (t.status === 'BLOCKED') acc[t.subsystem].blocked++;
        return acc;
      }, {}),
      recentTasks: tasks.slice(0, 20).map((t: any) => ({
        title: t.title,
        subsystem: t.subsystem,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo,
        deadline: t.deadline,
        progressPercent: t.progressPercent || 0,
      })),
    };

    // Summarize members
    const memberSummary = users.map((u: any) => ({
      name: u.displayName,
      email: u.email,
      role: u.role,
      teams: u.approvedTeams || [],
      isOnline: u.isOnline || false,
      year: u.year || 'Unknown',
    }));

    // Finance summary
    const financeSummary = {
      overall: finances.overall || 0,
      teams: finances.teams || {},
    };

    return {
      taskSummary,
      memberSummary,
      subsystems,
      financeSummary,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[AI] Failed to fetch live context:', err);
    return {};
  }
}

/** Build system prompt with live data injected */
function buildSystemPrompt(liveContext: Record<string, any>, userProfile?: any): string {
  const role = userProfile?.role || 'MEMBER';
  const name = userProfile?.displayName || 'Team Member';
  const teams = (userProfile?.approvedTeams || []).join(', ') || 'General';

  const taskSummary = liveContext.taskSummary;
  const memberSummary = liveContext.memberSummary || [];
  const finances = liveContext.financeSummary;
  const subsystems = liveContext.subsystems || {};

  // Format subsystem overview
  const subsystemLines = Object.entries(subsystems)
    .map(([id, s]: any) => `  - ${id}: progress=${s.progress || 0}%, readiness=${s.readiness || 0}%, pendingTasks=${s.pendingTasks || 0}, status=${s.status || 'unknown'}`)
    .join('\n') || '  (No subsystem data)';

  // Format task summary
  const taskLines = taskSummary ? `
  Total: ${taskSummary.total}, Completed: ${taskSummary.completed}, In Progress: ${taskSummary.inProgress}, Pending: ${taskSummary.pending}, Blocked: ${taskSummary.blocked}, Critical: ${taskSummary.critical}
  By Subsystem:
${Object.entries(taskSummary.bySubsystem || {}).map(([sub, s]: any) => `    - ${sub}: total=${s.total}, done=${s.completed}, inProgress=${s.inProgress}, blocked=${s.blocked}`).join('\n')}
  Recent Tasks (up to 20):
${(taskSummary.recentTasks || []).map((t: any) => `    - [${t.status}] "${t.title}" | ${t.subsystem} | Assigned: ${t.assignedTo} | Priority: ${t.priority} | ${t.progressPercent}% | Deadline: ${t.deadline}`).join('\n')}` : '  (No task data)';

  // Format members
  const memberLines = memberSummary.length > 0
    ? memberSummary.map((m: any) => `  - ${m.name} (${m.role}) | Teams: [${m.teams.join(', ') || 'none'}] | ${m.isOnline ? 'Online' : 'Offline'} | Year: ${m.year} | Email: ${m.email}`).join('\n')
    : '  (No member data)';

  return `You are A.S.T.R.A. — the Artificial Solar Team Resource Assistant for Team ASTRA at SKCET, a solar electric vehicle racing team competing in SEVC (Solar Electric Vehicle Championship).

You have access to LIVE, real-time data from the ASTRA platform as of ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Use this data to answer questions accurately and helpfully.

## Current User
- Name: ${name}
- Role: ${role}
- Teams: ${teams}

## Live Task Data
${taskLines}

## Team Members (${memberSummary.length} total)
${memberLines}

## Subsystems Status
${subsystemLines}

## Finance Overview
- Overall Spend: ₹${finances?.overall?.toLocaleString('en-IN') || '0'}
- By Team: ${JSON.stringify(finances?.teams || {})}

## Your Capabilities
- Answer questions about tasks, team members, subsystem progress, deadlines, finances
- Give status updates ("Who is working on brakes?", "What tasks are blocked?", "Show me critical tasks")
- Navigate the app (tell users to go to specific sections)
- Provide engineering guidance based on Team ASTRA's solar car knowledge
- Help prioritize work, identify risks, and suggest next steps
- Answer in a concise, professional, mission-focused tone as a team AI

## Rules
- Always reference the live data when answering about tasks, members, or progress
- If data is missing, say so honestly
- Keep answers brief and actionable
- You support Tamil/English mixed responses if the user speaks Tamil
- Current date/time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
}

/** Internal helper — call Backend AI endpoints */
async function callBackendAI(endpoint: string, body: any) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'Unknown Error' }));
    const error = new Error(errData.error || `AI API error ${response.status}`);
    (error as any).detail = errData.detail;
    (error as any).status = response.status;
    throw error;
  }

  return await response.json();
}

// ─── Exported AI Functions ────────────────────────────────────────────────────

/** Chat assistant — used by AIAssistant.tsx */
export async function chatAssistant(messages: any[], userProfile?: any) {
  try {
    // Fetch live data from Firebase
    const liveContext = await fetchLiveContext();
    const systemPrompt = buildSystemPrompt(liveContext, userProfile);

    // Inject system prompt as the first message
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m: any) => m.role !== 'system'), // Keep user/assistant turns, strip old system
    ];

    const result = await callBackendAI("/api/chat", { messages: fullMessages });
    return result.message || "A.S.T.R.A. neural link established. Ready for your query.";
  } catch (error: any) {
    console.error("AI Chat failed:", error);
    if (error.message?.includes('Missing API Key') || error.message?.includes('offline')) {
      return "⚠️ A.S.T.R.A. AI engine is offline — missing API key. Contact the app admin.";
    }
    return "Neural network connection lost. Please check your connection and try again.";
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


