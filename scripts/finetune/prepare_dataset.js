import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ASTRA_KNOWLEDGE_BASE } from '../../src/astraKnowledge.ts';

// Configure dotenv to read .env file from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const FIREBASE_DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

// CLI arguments
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_CHUNKS = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999');

if (!GROQ_API_KEY) {
  console.error('❌ Error: GROQ_API_KEY is not set in .env file');
  process.exit(1);
}

if (!FIREBASE_DATABASE_URL || !FIREBASE_DATABASE_SECRET) {
  console.error('❌ Error: Firebase credentials are not set in .env file');
  process.exit(1);
}

// Utility to sleep between requests to avoid Groq rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFirebaseData() {
  const cleanUrl = FIREBASE_DATABASE_URL.replace(/\/$/, '');
  const secret = FIREBASE_DATABASE_SECRET;

  console.log('📡 Fetching live data from Firebase RTDB...');
  
  let users = {};
  let tasks = {};
  
  try {
    const usersRes = await fetch(`${cleanUrl}/users.json?auth=${secret}`);
    if (usersRes.ok) users = await usersRes.json() || {};
    
    const tasksRes = await fetch(`${cleanUrl}/tasks.json?auth=${secret}`);
    if (tasksRes.ok) tasks = await tasksRes.json() || {};
    
    console.log(`✅ Loaded ${Object.keys(users).length} users and ${Object.keys(tasks).length} tasks.`);
  } catch (err) {
    console.warn('⚠️ Firebase fetch failed, using fallback empty records:', err.message);
  }

  return { users, tasks };
}

// Generates static QA pairs from RTDB lists
function generateStructuredQAs(users, tasks) {
  const qas = [];

  // Generate User & Role QAs
  Object.entries(users).forEach(([uid, profile]) => {
    const name = profile.displayName || profile.name || 'Unknown User';
    const role = profile.role || 'Member';
    const subsystem = profile.subsystem || profile.department || 'General';
    
    qas.push({
      instruction: `Who is ${name} and what is their role in Team ASTRA?`,
      output: `${name} is a ${role} working in the ${subsystem} subsystem/department for Team ASTRA.`
    });
    
    qas.push({
      instruction: `Which subsystem does team member ${name} belong to?`,
      output: `${name} belongs to the ${subsystem} subsystem.`
    });
  });

  // Generate Task status QAs
  Object.entries(tasks).forEach(([tid, task]) => {
    const title = task.title || task.name || 'Untitled Task';
    const desc = task.description || 'No description provided';
    const status = task.status || 'Pending';
    const subsystem = task.subsystem || 'General';
    const assignee = task.assignedToName || task.assigneeName || 'Unassigned';

    qas.push({
      instruction: `What is the status of the task "${title}"?`,
      output: `The task "${title}" in the ${subsystem} subsystem is currently in "${status}" status. Description: ${desc}.`
    });

    qas.push({
      instruction: `Who is assigned to complete the task "${title}"?`,
      output: `The task "${title}" is assigned to ${assignee}.`
    });
  });

  return qas;
}

// Chunks the large PDF documents into smaller parts
function getChunksFromKnowledge() {
  const chunks = [];
  ASTRA_KNOWLEDGE_BASE.forEach(doc => {
    if (doc.text && !doc.text.startsWith('[')) {
      // Chunk by roughly 1500 chars (aiming at paragraphs)
      const paragraphs = doc.text.split('\n');
      let currentChunk = '';
      
      paragraphs.forEach(p => {
        if ((currentChunk + p).length > 1500) {
          chunks.push({ label: doc.label, text: currentChunk.trim() });
          currentChunk = p + '\n';
        } else {
          currentChunk += p + '\n';
        }
      });
      if (currentChunk.trim()) {
        chunks.push({ label: doc.label, text: currentChunk.trim() });
      }
    }
  });
  return chunks;
}

// Calls Groq to generate QA pairs from a single text chunk
async function generateQAFromChunk(chunk, index, total) {
  console.log(`🤖 [${index}/${total}] Generating QA for: ${chunk.label} (Length: ${chunk.text.length} chars)...`);
  
  const systemPrompt = `You are a machine learning data pipeline assistant. 
Analyze the provided engineering/rules text and generate 2 to 3 high-quality instruction-response QA pairs that would be ideal for fine-tuning an AI assistant for Team ASTRA.
Format the instructions as natural questions someone would ask about the team's specifications, designs, parameters, or rules.
Format the outputs as detailed, complete, and factual answers based strictly on the text.
The output MUST be a valid JSON array of objects, containing "instruction" and "output" keys.
Do not include any chat formatting, thoughts, explanation, or markdown backticks in the response. Output only the raw JSON.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Source Document: ${chunk.label}\n\nText:\n${chunk.text}` }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    
    // Clean potential markdown wrap
    const cleaned = content.replace(/^```json/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        instruction: item.instruction || '',
        output: item.output || ''
      })).filter(item => item.instruction && item.output);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to generate QA for chunk ${index}:`, err.message);
  }
  return [];
}

async function uploadToFirebase(dataset) {
  const cleanUrl = FIREBASE_DATABASE_URL.replace(/\/$/, '');
  const secret = FIREBASE_DATABASE_SECRET;

  console.log(`📤 Uploading dataset (${dataset.length} items) to Firebase RTDB...`);
  try {
    const res = await fetch(`${cleanUrl}/finetuning/dataset.json?auth=${secret}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataset)
    });
    
    if (res.ok) {
      console.log('🚀 Successfully uploaded to /finetuning/dataset in Firebase Realtime Database!');
    } else {
      console.error('❌ Upload failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('❌ Upload failed with error:', err.message);
  }
}

async function run() {
  console.log('============================================================');
  console.log('🚀 ASTRA Fine-tuning Dataset Generator');
  console.log('============================================================\n');

  // 1. Fetch live DB data
  const { users, tasks } = await fetchFirebaseData();
  const structuredQAs = generateStructuredQAs(users, tasks);
  console.log(`📊 Generated ${structuredQAs.length} structured QA pairs from live database.`);

  // 2. Load and chunk PDF knowledge base
  const chunks = getChunksFromKnowledge();
  console.log(`📄 Split engineering reports into ${chunks.length} chunks.`);

  const finalDataset = [...structuredQAs];

  if (DRY_RUN) {
    console.log('\n⏩ [DRY RUN ACTIVE] Skipping Groq calls. Generating sample PDF QA pairs...');
    finalDataset.push(
      { instruction: "What is ASTRA?", output: "ASTRA is Sri Krishna College of Engineering and Technology's Solar Electric Vehicle team." },
      { instruction: "What is the chassis material?", output: "The chassis material is AISI 4130 Carbon Steel." }
    );
  } else {
    // 3. Generate QA from chunks using Groq
    const chunksToProcess = chunks.slice(0, LIMIT_CHUNKS);
    console.log(`\n🤖 Sending ${chunksToProcess.length} text chunks to Groq for QA extraction...`);
    
    for (let i = 0; i < chunksToProcess.length; i++) {
      const qaPairs = await generateQAFromChunk(chunksToProcess[i], i + 1, chunksToProcess.length);
      finalDataset.push(...qaPairs);
      console.log(`  ✓ Generated ${qaPairs.length} QA pairs.`);
      // Add rate-limiting buffer delay
      await sleep(2500);
    }
  }

  // 4. Save locally
  const dirPath = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.join(dirPath, 'dataset.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalDataset, null, 2), 'utf8');
  console.log(`\n💾 Saved ${finalDataset.length} items locally to: scripts/finetune/dataset.json`);

  // 5. Upload to Firebase so Google Colab can pull it automatically
  await uploadToFirebase(finalDataset);

  console.log('\n============================================================');
  console.log('🎉 Preparation Finished successfully!');
  console.log('============================================================');
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
