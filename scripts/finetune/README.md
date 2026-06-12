# ASTRA Llama 3.1 8B Fine-tuning Pipeline

This folder contains the complete pipeline for generating a fine-tuning dataset from your team's historical PDF knowledge base and live Web App databases (users, roles, departments, tasks, and task updates) and training a Llama 3.1 8B model.

The dataset is automatically uploaded back to your Firebase Realtime Database, allowing **Google Colab** to fetch the training data directly in one click!

---

## 📂 Pipeline Architecture

1. **`prepare_dataset.js`**: Runs locally on your machine.
   - Reads your engineering PDF texts inside `src/astraKnowledge.ts`.
   - Fetches live tasks, members, roles, and status updates from Firebase RTDB.
   - Calls the Groq API to convert the documents into natural instruction-response QA pairs.
   - Saves `dataset.json` locally and pushes it to your Firebase RTDB at `/finetuning/dataset`.
2. **`train_unsloth.py`**: Runs in Google Colab (or any GPU cloud provider).
   - Fetches the compiled dataset directly from your Firebase RTDB in one step.
   - Loads the pre-quantized 4-bit Llama-3.1-8B-Instruct model using Unsloth.
   - Fine-tunes the model on your team's data using QLoRA.
   - Merges and saves the weights or pushes them to Hugging Face Hub.

---

## 🛠️ Step 1: Generate & Push Dataset

From the root directory of the ASTRA project, run the dataset preparation script:

```bash
# Option A: Full run (Calls Groq to generate QA pairs from all PDF chunks + live data)
npx tsx scripts/finetune/prepare_dataset.js

# Option B: Limit run (Only calls Groq for the first 10 PDF chunks - highly recommended to avoid Groq rate limits)
npx tsx scripts/finetune/prepare_dataset.js --limit=10

# Option C: Dry-run (End-to-end test. Fetches Firebase data, skips Groq, writes and uploads sample dataset)
npx tsx scripts/finetune/prepare_dataset.js --dry-run
```

Once successful, your dataset will be saved locally in `scripts/finetune/dataset.json` and pushed to your Firebase RTDB at `/finetuning/dataset.json`.

---

## ⚡ Step 2: Fine-tune in Google Colab

Since training requires a GPU (Tesla T4 or better), we recommend using **Google Colab** (Free or Pro).

### 1. Open Google Colab
Go to [Google Colab](https://colab.research.google.com/) and create a new notebook. Ensure you set the runtime to a GPU:
- Go to **Runtime** > **Change runtime type**.
- Select **T4 GPU** (or L4 / A100 if you have Colab Pro).

### 2. Install Dependencies
Run this in the first cell to install Unsloth and PyTorch requirements:

```python
# Install Unsloth and compatible libraries
!pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install --no-deps "xformers<0.0.27" "trl<0.9.0" peft accelerate bitsandbytes
```

### 3. Load variables and Run Training
In a new cell, copy-paste the contents of your [train_unsloth.py](file:///c:/Users/M.DINESH/Downloads/astra-–-solar-kart-intelligence-&-team-management-platform/scripts/finetune/train_unsloth.py) file.

Configure your environment keys directly in the script or run:
```python
import os
os.environ["FIREBASE_DATABASE_URL"] = "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app"
os.environ["FIREBASE_DATABASE_SECRET"] = "nbN32sF35ZGFoP3IdVaGkVb5t9gW5NFj3V7Gu7rY"

# Optional: Set this to automatically upload your model to your Hugging Face account
os.environ["HUGGING_FACE_TOKEN"] = "your_huggingface_token" 
```

Run the cell. It will download the dataset directly from your database, load the base model, perform LoRA instruction-tuning, and save the output.

---

## 🚀 Step 3: Deploy & Connect to ASTRA

Once trained, you can connect your model to the ASTRA interface using one of the two methods below:

### Option A: Serverless Hosting (Requires Hugging Face)
If you uploaded your merged model weights to Hugging Face, you can host them on serverless endpoints like **Together AI**, **Fireworks AI**, or **Replicate**:

1. In ASTRA UI chat settings (gear icon), configure:
   - **API Endpoint URL**: `https://api.together.xyz/v1/chat/completions` (or equivalent)
   - **Model Name / ID**: `your_username/astra-llama-3.1-8b`
   - **API Key**: (Your Together/Fireworks API key)

---

### Option B: Expose Colab Model Directly (No Hugging Face required)
If you do not want to upload your weights to Hugging Face, you can serve the model directly from Google Colab using **Ollama** and **localtunnel**:

1. **Quantize and Export to GGUF**: Run this cell at the end of your Colab notebook to save the model:
   ```python
   model.save_pretrained_gguf("astra_model", tokenizer, quantization_method = "q4_k_m")
   ```

2. **Install and Run Ollama**: Add a cell in Colab to install and launch Ollama in the background:
   ```python
   # Install Ollama
   !curl -fsSL https://ollama.com/install.sh | sh

   # Start Ollama in background
   import subprocess
   import time
   process = subprocess.Popen(["ollama", "serve"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
   time.sleep(3) # Wait for startup
   ```

3. **Import GGUF weights**: Import the compiled GGUF file into Ollama:
   ```python
   # Create a Modelfile
   with open("Modelfile", "w") as f:
       f.write("FROM ./astra_model-unsloth.Q4_K_M.gguf")

   # Import
   !ollama create astra-model -f Modelfile
   ```

4. **Expose the port using Localtunnel**:
   ```bash
   # Install localtunnel globally
   !npm install -g localtunnel

   # Expose Ollama (port 11434) to the internet (this will print a public URL)
   !lt --port 11434
   ```

5. **Configure ASTRA Chatbot settings** (gear icon):
   - **API Endpoint URL**: `https://YOUR_LOCALTUNNEL_SUBDOMAIN.localtunnel.me/v1/chat/completions`
   - **Model Name / ID**: `astra-model`
   - **API Key**: `ollama` (any placeholder text)
