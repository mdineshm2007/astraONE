// ─────────────────────────────────────────────────────────────────────────────
// ASTRA AI Service — Direct Groq API (no backend required)
// ─────────────────────────────────────────────────────────────────────────────

import { ref, get } from 'firebase/database';
import { rtdb } from './firebase';
import { buildAstraContext } from './astraKnowledge';

// Retrieve key dynamically to support custom keys set in client settings (localStorage)
export function getGroqApiKey(): string {
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('astra_user_groq_api_key');
    if (localKey && localKey.trim()) {
      return localKey.trim();
    }
  }
  // No fallback hardcoded key — use env var only (set GROQ_API_KEY in Vercel dashboard)
  return (process.env.GROQ_API_KEY || '') as string;
}

// Retrieve custom API endpoint dynamically (for custom fine-tuned Llama endpoints)
export function getAiEndpoint(): string {
  if (typeof window !== 'undefined') {
    const localEndpoint = localStorage.getItem('astra_user_ai_endpoint');
    if (localEndpoint && localEndpoint.trim()) {
      return localEndpoint.trim();
    }
  }
  return '/api/chat';
}

// Retrieve custom Model ID dynamically (for custom fine-tuned models)
export function getAiModelId(): string {
  if (typeof window !== 'undefined') {
    const localModel = localStorage.getItem('astra_user_ai_model_id');
    if (localModel && localModel.trim()) {
      return localModel.trim();
    }
  }
  return 'llama-3.1-8b-instant';
}

const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const API_CHAT_URL = '/api/chat';


// ─── ASTRA Knowledge Base ─────────────────────────────────────────────────────
// Deep domain knowledge about ASTRA's workflows, report structures, and SEVC rules
const ASTRA_KNOWLEDGE_BASE = `
## ASTRA SEVC Knowledge Base

### About ASTRA
ASTRA (Artificially Smart Team for Racing Applications) is the solar electric vehicle team at SKCET (Sri Krishna College of Engineering and Technology), Coimbatore. The team competes in SEVC (Solar Electric Vehicle Championship) organized by SAE India. The vehicle is a solar-powered electric kart.

### Team Structure
- **Captain**: Overall team lead, manages all subsystems
- **Team Lead**: Leads a specific subsystem (Steering, Suspension, Brakes, Transmission, Design, Electricals, Innovation, Autonomous, Cost, PRO)
- **Member**: Works under a team lead in a specific subsystem

### Subsystems
1. **Steering** – Steering geometry, rack & pinion, Ackermann angle, toe, camber
2. **Suspension** – Wishbone/double wishbone, spring-damper, ride height, ground clearance
3. **Brakes** – Disc brakes, brake bias, hydraulic system, braking distance
4. **Transmission** – Chain/belt drive, gear ratio, motor coupling, differential
5. **Design** – Vehicle body, chassis, aerodynamics, CAD (SolidWorks/CATIA), weight distribution
6. **Electricals** – Solar panels (monocrystalline), battery (LiFePO4/Li-ion), BMS, motor controller, wiring
7. **Innovation** – Unique/novel engineering feature beyond standard requirements
8. **Autonomous** – Self-driving feature, sensors (ultrasonic, camera), path planning
9. **Cost** – Cost report, BOM (Bill of Materials), manufacturing cost analysis
10. **PRO** – Public Relations Officer, media, sponsorship, social media

### SEVC Report Structures

#### 1. DESIGN REPORT
- Cover Page: Team name, college, vehicle name, year
- Table of Contents
- Executive Summary (1 page overview)
- Chassis & Frame: Material (AISI 1018/4130 steel), tube dimensions, FEM analysis, weight
- Suspension Design: Type, geometry calculations, Ackermann, toe/camber angles, spring rate
- Steering System: Steering ratio, turning radius, rack & pinion design
- Braking System: Brake disc diameter, caliper type, brake force calculation, stopping distance
- Transmission: Motor specs, drive ratio, chain/belt selection, efficiency
- Electrical System: Solar panel specs (wattage, efficiency, VOC, ISC), battery specs (voltage, capacity, cell chemistry), BMS parameters, motor controller, wiring diagram
- Ergonomics: Driver position, pedal layout, visibility
- Safety: Roll cage, fire extinguisher, kill switch, seatbelt
- Manufacturing Plan: Timeline, processes used
- Conclusion & Future Improvements
- References

#### 2. INNOVATION REPORT
- Cover Page: Team name, college, Innovation title
- Abstract (150-200 words): What is the innovation, why it matters
- Problem Statement: What engineering problem does this innovation solve?
- Literature Survey: Existing solutions, patents, research papers (cite 5-10 references)
- Proposed Innovation Description: Detailed explanation with diagrams/photos
- Design & Calculations: Engineering calculations proving feasibility
- Working Principle: How it works step by step
- Advantages over existing solutions: Quantitative comparison
- Implementation Details: Materials, cost, manufacturing process
- Test Results / Simulation Results: Data tables, graphs
- Conclusion: Impact, effectiveness, future scope
- References (IEEE/SAE format)

**Innovation Report Tips:**
- Innovation must be novel and not a copy of existing SAE submissions
- Must include patents search (Google Patents, USPTO)
- Must have working prototype or simulation proof
- Judges look for: originality, engineering rigor, practical feasibility, cost-effectiveness
- Common innovations: regenerative braking, MPPT solar tracking, active aerodynamics, lightweight materials, smart BMS

#### 3. COST REPORT
- Cover Page
- BOM (Bill of Materials): Part name, quantity, unit cost, total cost, vendor, specification
- Manufacturing Cost: Labour hours × rate, machine time
- Cost Breakdown by Subsystem (pie chart)
- Total Vehicle Cost
- Cost vs Performance Justification
- Comparison with commercial alternatives

#### 4. MEDIA/PRO REPORT
- Team profile and story
- Sponsor acknowledgements
- Social media analytics (followers, reach, posts)
- Press coverage
- Outreach activities (school visits, workshops)
- Sponsorship deck

#### 5. PROGRESS REPORT (Monthly/Weekly)
- What was planned
- What was done (with photos)
- % completion
- Issues faced
- Next steps
- Timeline vs actual

### SEVC Rules & Important Notes
- Vehicle must be solar-powered only during the event (no external charging during race)
- Max solar panel area: as per current year's rulebook
- Safety requirements: roll cage, fire suppression, kill switch accessible from outside
- Driver weight + safety gear considered in weight class
- Endurance event, efficiency event, and presentation are key scoring categories
- Innovation report is a separate scoring category (usually 20-30 marks)
- Cost report: teams that go over budget get penalized

### Common Engineering Calculations for ASTRA

**Solar Power Calculation:**
- P_solar = Irradiance (W/m²) × Panel Area (m²) × Panel Efficiency
- Standard test condition: 1000 W/m² at 25°C

**Battery Sizing:**
- Energy required = Power × Time (Wh)
- Battery capacity = Energy / (Voltage × DoD)

**Braking Distance:**
- s = v² / (2 × µ × g), where µ = friction coefficient ≈ 0.7 for rubber on asphalt

**Gear Ratio Selection:**
- Final speed = (Motor RPM / Gear Ratio) × Wheel Circumference
- Torque at wheel = Motor Torque × Gear Ratio × Efficiency

**Steering – Ackermann Angle:**
- tan(θ_inner) = L / (R - t/2)
- tan(θ_outer) = L / (R + t/2)
- L = wheelbase, R = turning radius, t = track width

### Deadlines & Workflow
- Reports typically submitted 2-4 weeks before the event
- Each subsystem files a progress report weekly
- Innovation report requires 4-6 weeks of development + 2 weeks for writing
- BOM must be updated whenever a part is purchased

### Previous Year Highlights
- ASTRA has competed in SEVC since 2022
- Key achievements: innovation awards, top-10 finishes in endurance
- Past innovations included: MPPT solar tracking, active suspension, smart BMS

### Task Progress Update Instructions
To update task progress in ASTRA platform:
1. Go to Engineering Hub (Teams section)
2. Find your assigned task
3. Click on the task or progress button
4. Enter today's progress description and update the percentage
5. Must be done before 8:30 PM daily
`;

/** Fetch live app data from Firebase for AI context */
async function fetchLiveContext(): Promise<Record<string, any>> {
  try {
    const [tasksSnap, usersSnap, subsystemsSnap] = await Promise.all([
      get(ref(rtdb, 'tasks')),
      get(ref(rtdb, 'users')),
      get(ref(rtdb, 'subsystems')),
    ]);

    const tasks = tasksSnap.exists() ? Object.entries(tasksSnap.val()).map(([id, v]: any) => ({ id, ...v })) : [];
    const users = usersSnap.exists() ? Object.entries(usersSnap.val()).map(([id, v]: any) => ({ id, ...v })) : [];
    const subsystems = subsystemsSnap.exists() ? subsystemsSnap.val() : {};

    // Sort tasks by createdAt descending (newest first) so recent tasks are actually the latest ones
    const sortedTasks = [...tasks].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

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
      recentTasks: sortedTasks.slice(0, 100).map((t: any) => ({
        title: t.title,
        subsystem: t.subsystem,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo,
        deadline: t.deadline,
        progressPercent: t.progressPercent || 0,
        todayProgress: t.todayProgress || '',
      })),
    };

    const memberSummary = users.map((u: any) => ({
      name: u.displayName,
      email: u.email,
      role: u.role,
      teams: u.approvedTeams || [],
      isOnline: u.isOnline || false,
      year: u.year || 'Unknown',
    }));

    return { taskSummary, memberSummary, subsystems, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.warn('[AI] Failed to fetch live context:', err);
    return {};
  }
}

/** Build system prompt with live data + ASTRA knowledge base */
function buildSystemPrompt(liveContext: Record<string, any>, userProfile?: any): string {
  const role = userProfile?.role || 'MEMBER';
  const name = userProfile?.displayName || 'Team Member';
  const teams = (userProfile?.approvedTeams || []).join(', ') || 'General';

  const taskSummary = liveContext.taskSummary;
  const memberSummary = liveContext.memberSummary || [];
  const subsystems = liveContext.subsystems || {};

  const subsystemLines = Object.entries(subsystems)
    .map(([id, s]: any) => `  - ${id}: progress=${s.progress || 0}%, status=${s.status || 'unknown'}`)
    .join('\n') || '  (No subsystem data)';

  // Show all active tasks: IN_PROGRESS, BLOCKED, PENDING, and CRITICAL (capped at 15)
  const activeTasks = taskSummary && taskSummary.recentTasks
    ? taskSummary.recentTasks
        .filter((t: any) =>
          t.status === 'IN_PROGRESS' ||
          t.status === 'BLOCKED' ||
          t.status === 'PENDING' ||
          t.priority === 'CRITICAL'
        )
        .slice(0, 15)
    : [];

  const taskLines = taskSummary ? `
  Total Tasks: ${taskSummary.total} (Done: ${taskSummary.completed}, Active: ${taskSummary.inProgress}, Blocked: ${taskSummary.blocked})
  Active/Critical Tasks (capped at 15):
${activeTasks.map((t: any) => `    - [${t.status}] "${t.title}" | ${t.subsystem} | Assigned: ${t.assignedTo} | ${t.progressPercent}%`).join('\n')}` : '  (No task data)';

  // Compress team members: list only online members, and count offline ones to save massive tokens
  const onlineMembers = memberSummary.filter((m: any) => m.isOnline);
  const onlineNames = onlineMembers.map((m: any) => `${m.name} (${m.role})`).join(', ') || 'None';
  const offlineCount = memberSummary.length - onlineMembers.length;

  const memberLines = `Total Members: ${memberSummary.length}
  🟢 Online (${onlineMembers.length}): ${onlineNames}
  ⚫ Offline: ${offlineCount} members`;

  // Build the PDF-derived historical context (up to 150 chars per doc to save tokens)
  const historicalContext = buildAstraContext(150);

  return `You are A.S.T.R.A. — the Artificial Solar Team Resource Assistant, the dedicated AI of Team ASTRA at SKCET. You are an expert in solar electric vehicle engineering, SEVC competition rules, and ASTRA's internal team management platform.

## Current User
- Name: ${name}
- Role: ${role}
- Teams: ${teams}
- Current Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST

## Academic Year & Project Stage Context
- Current Cycle: We are at the start of the NEW academic year 2026–2027.
- Competition: The SEVC 2027 competition is scheduled for February 2027.
- Project Stage: This is the very beginning of our development cycle. The new 1st-year students have not yet arrived. Once they join, the team will conduct a 2-week tutorial/training period for them before we begin any vehicle design.
- Previous Year Status: Last year's reports and design cycle (SEVC 2026) were successfully completed and submitted at the competition. That cycle is fully complete.
- Progress Expectations: Because it is the absolute start of the cycle, having 0% progress on tasks (or tasks in a PENDING status, such as new assignments given to members like Sarath) is completely normal, expected, and standard. It is NOT a delay or a sign of lagging. Do not say that tasks are lagging compared to last year's completed reports.

## Live Platform Data

### Task Status
${taskLines}

### Team Members
${memberLines}

### Subsystems Status
${subsystemLines}

## Engineering Formulas & Team Guidelines
${ASTRA_KNOWLEDGE_BASE}

## Historical Context & Previous Year Reports (PDF Data)
${historicalContext || 'No historical reports found.'}

## Your Behaviour
- You have both LIVE data from the ASTRA platform AND deep engineering domain knowledge (including previous year reports)
- Answer questions about tasks, members, progress, deadlines using the live data above
- Answer questions about report structure, how to write reports, engineering calculations, SEVC rules using the knowledge base and historical reports
- If asked "how to write innovation report" or "what content should be inside" — give the full structure, sections, and tips from the knowledge base and previous year's reports
- If asked about task progress — reference the live data and the current academic year context (0% at start of year/orientation phase is normal, not lagging)
- Keep answers clear, practical, and team-focused
- Respond ONLY in English. Do NOT write in Tamil, Tanglish, or any other language unless the user explicitly asks: "Speak in Tamil" or "Translate to Tamil". If the user writes in Tamil, reply in English unless they ask you to speak in Tamil.
- Be direct and actionable — this is an engineering team AI, not a general chatbot
- If data is unavailable, say so clearly and suggest where to find it`;
}

/** Call via Express backend proxy — avoids CORS, key stays secure on server */
async function callGroqDirect(messages: any[]): Promise<string> {
  const endpoint = getAiEndpoint();
  const model = getAiModelId();
  const apiKey = getGroqApiKey();

  // Try server proxy first (safe, no CORS)
  try {
    const proxyRes = await fetch(API_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages,
        endpoint: endpoint.startsWith('/') ? undefined : endpoint,
        model,
        apiKey
      }),
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.message) return data.message;
    }
    // If proxy fails, log and fall through to direct call
    console.warn('[AI] Backend proxy failed, trying direct call...');
  } catch (proxyErr) {
    console.warn('[AI] Backend proxy error:', proxyErr);
  }

  // Fallback: call target API directly from browser (may hit CORS but serves as resilient backup)
  const targetUrl = endpoint.startsWith('/') ? GROQ_URL : endpoint;
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: { message: 'Unknown AI API error' } }));
    throw new Error(errData.error?.message || `AI API error ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response generated.';
}

// ─── Exported AI Functions ────────────────────────────────────────────────────

/** Chat assistant — used by AIAssistant.tsx */
export async function chatAssistant(messages: any[], userProfile?: any) {
  try {
    const liveContext = await fetchLiveContext();
    const systemPrompt = buildSystemPrompt(liveContext, userProfile);

    const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...nonSystemMessages.slice(-6),
    ];

    return await callGroqDirect(fullMessages);
  } catch (error: any) {
    console.error('AI Chat failed:', error);
    if (!navigator.onLine) {
      return '📡 You are offline. Please check your internet connection.';
    }
    if (error.message?.includes('401') || error.message?.includes('invalid_api_key') || error.message?.includes('Invalid API Key')) {
      return '⚠️ A.S.T.R.A. API key is invalid or expired. A new key is required.';
    }
    if (error.message?.includes('rate_limit') || error.message?.includes('429') || error.message?.includes('too large')) {
      return '⚠️ AI request too large or rate limited. Please wait a moment and try again.';
    }
    return `❌ A.S.T.R.A. error: ${error.message}. Please try again or refresh the page.`;
  }
}

/** Voice transcription — placeholder */
export async function transcribeVoice(blob: Blob) {
  console.log('Voice transcription requested...');
  return null;
}

/** Summarize notes */
export async function summarizeNotes(notes: any[]) {
  try {
    const messages = [
      { role: 'system', content: 'You are ASTRA AI. Summarize these engineering notes concisely.' },
      { role: 'user', content: `Notes: ${JSON.stringify(notes)}` }
    ];
    return await callGroqDirect(messages);
  } catch (error) {
    console.error('AI Summary failed:', error);
    return 'Failed to synchronize AI summary.';
  }
}

/** Generate project schedule */
export async function generateSchedule(raceDate: string) {
  try {
    const messages = [
      { role: 'system', content: 'You are ASTRA AI Scheduler. Generate a JSON schedule with phases array. Each phase: { name, startDate, endDate, tasks: [] }.' },
      { role: 'user', content: `Generate a solar car build schedule. Race date: ${raceDate}. Return valid JSON only.` }
    ];
    const result = await callGroqDirect(messages);
    try { return JSON.parse(result); } catch { return { phases: [] }; }
  } catch (error) {
    console.error('AI Schedule failed:', error);
    return { phases: [] };
  }
}

/** Innovation suggestions */
export async function getInnovationSuggestions(subSystemLogs: any[], currentIssues: string[]) {
  try {
    const messages = [
      { role: 'system', content: 'You are ASTRA Innovation Engine. Provide 3 actionable engineering improvement suggestions for a solar electric vehicle team.' },
      { role: 'user', content: `Subsystem logs: ${JSON.stringify(subSystemLogs)}\nCurrent issues: ${JSON.stringify(currentIssues)}` }
    ];
    return await callGroqDirect(messages);
  } catch (error) {
    console.error('AI Innovation failed:', error);
    return 'Failed to fetch innovation suggestions.';
  }
}

/** Team performance analysis */
export async function getTeamAnalysis(data: any) {
  try {
    const messages = [
      { role: 'system', content: 'You are ASTRA AI. Analyze team performance data and return structured JSON insights.' },
      { role: 'user', content: `Team data: ${JSON.stringify(data)}` }
    ];
    const result = await callGroqDirect(messages);
    try { return JSON.parse(result); } catch { return { summary: result }; }
  } catch (error) {
    console.error('Team AI Analysis failed:', error);
    throw error;
  }
}

/** Task insights summary — Dashboard panel */
export async function getTaskInsights(tasks: any[], updates: any[], role?: string) {
  try {
    const messages = [
      { role: 'system', content: 'You are ASTRA AI. Analyze task progress and provide a brief engineering team summary.' },
      { role: 'user', content: `Tasks: ${JSON.stringify(tasks.slice(0, 30))}\nRole: ${role}` }
    ];
    return await callGroqDirect(messages);
  } catch (error) {
    console.error('Task insights failed:', error);
    return 'Failed to fetch task insights.';
  }
}
