import Groq from "groq-sdk";

export async function generateAIInsights(data: any) {
  // In Cloud Functions, env vars come from functions config or process.env depending on setup
  // We'll use process.env.GROQ_API_KEY for newer gen 2 or standard node.js dotenv setup.
  // Note: Ensure the API key is set in the environment.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
      console.warn("GROQ_API_KEY missing. Skipping AI insights.");
      return "AI Insights Unavailable: Missing API Key.";
  }

  const groq = new Groq({ apiKey });

  // Prepare a condensed summary to avoid token limits
  const summaryContext = {
      totalTasks: data.tasks.length,
      completedTasks: data.tasks.filter((t: any) => t.status === "COMPLETED").length,
      subsystems: data.subsystems.map((s: any) => ({ name: s.name, progress: s.progress, status: s.status })),
      delays: data.delayLogs.slice(0, 20), // just sample
  };

  const prompt = `
  You are an expert Engineering Project Manager AI.
  Analyze the following 60-day progress summary of a Solar Car engineering team.
  Provide a concise report with the following details:
  1. Team Efficiency Score (0-100%)
  2. Slowest Subsystem
  3. Estimated Delay Percentage
  4. Integration Readiness Estimate
  5. Key Actionable Advice

  Data:
  ${JSON.stringify(summaryContext)}
  `;

  try {
      const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama-3.1-8b-instant",
      });

      return completion.choices[0]?.message?.content || "No insights generated.";
  } catch (error) {
      console.error("Error generating AI insights:", error);
      return "Failed to generate AI insights due to an error.";
  }
}
