"""
ASTRA Llama 3.1 8B Fine-Tuning Script with Unsloth
Optimized for Google Colab (T4 / A100 GPU)

This script automatically pulls your training dataset from your Firebase Realtime
Database, sets up LoRA fine-tuning for Llama-3.1-8B-Instruct, and outputs the
merged model weights.
"""

import os
import requests
import json
import torch
from datasets import Dataset
from trl import SFTTrainer
from transformers import TrainingArguments
from unsloth import FastLanguageModel

# ==========================================
# 1. SETUP CREDENTIALS
# ==========================================
# In Google Colab, you can add these to the "Secrets" tab (left sidebar keys icon)
# or paste them directly here:
FIREBASE_DATABASE_URL = os.environ.get(
    "FIREBASE_DATABASE_URL", 
    "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app"
)
FIREBASE_DATABASE_SECRET = os.environ.get(
    "FIREBASE_DATABASE_SECRET", 
    "nbN32sF35ZGFoP3IdVaGkVb5t9gW5NFj3V7Gu7rY"
)
HUGGING_FACE_TOKEN = os.environ.get("HUGGING_FACE_TOKEN", "") # Optional: To save directly to HF Hub
HF_OUTPUT_REPOSITORY = "your_username/astra-llama-3.1-8b"    # Optional: Hugging Face repo name

# ==========================================
# 2. DOWNLOAD DATASET FROM FIREBASE RTDB
# ==========================================
def download_dataset():
    print("📡 Downloading training dataset from Firebase Realtime Database...")
    url = f"{FIREBASE_DATABASE_URL.rstrip('/')}/finetuning/dataset.json?auth={FIREBASE_DATABASE_SECRET}"
    response = requests.get(url)
    
    if response.status_code != 200:
        raise Exception(f"❌ Failed to fetch dataset: HTTP {response.status_code}\n{response.text}")
        
    data = response.json()
    print(f"✅ Downloaded {len(data)} instruction-response pairs successfully!")
    return data

dataset_json = download_dataset()

# ==========================================
# 3. PREPARE UNLOTHS'S MODEL & TOKENIZER
# ==========================================
max_seq_length = 2048 # Supports RoPE scaling up to 128k (standard Llama 3.1)
dtype = None # None for auto-detection. Float16 for Tesla T4, Bfloat16 for Ampere+
load_in_4bit = True # 4bit quantization reduces VRAM usage significantly

print("🚀 Loading base model (Llama-3.1-8B-Instruct-bnb-4bit)...")
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/meta-llama-3.1-8b-Instruct-bnb-4bit",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# Apply PEFT / LoRA target configuration
print("🔧 Configuring LoRA parameters...")
model = FastLanguageModel.get_peft_model(
    model,
    r = 16, # Choose any number > 0. Suggested 8, 16, 32, 64, 128
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                      "gate_proj", "up_proj", "down_proj",],
    lora_alpha = 16,
    lora_dropout = 0, # Optimized at 0
    bias = "none",    # Optimized at "none"
    use_gradient_checkpointing = "unsloth", # Reduces VRAM overhead
    random_state = 3407,
    use_rslora = False,
    loftq_config = None,
)

# ==========================================
# 4. CHAT TEMPLATE FORMATTING
# ==========================================
# Format dataset into Llama 3.1 conversational instruction template
ASTRA_SYSTEM_PROMPT = (
    "You are ASTRA AI, the expert intelligence assistant for Team ASTRA "
    "(Sri Krishna College of Engineering and Technology's Solar Electric Vehicle Team). "
    "Use your extensive engineering knowledge about steering, suspension, brakes, "
    "transmission, autonomous systems, electrical schemas, budgets, and rulebooks to answer "
    "queries accurately."
)

def format_prompts(examples):
    instructions = examples["instruction"]
    outputs      = examples["output"]
    texts = []
    for instruction, output in zip(instructions, outputs):
        # Format matching Llama-3.1's special tokens
        text = (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            f"{ASTRA_SYSTEM_PROMPT}<|eot_id|>"
            "<|start_header_id|>user<|end_header_id|>\n\n"
            f"{instruction}<|eot_id|>"
            "<|start_header_id|>assistant<|end_header_id|>\n\n"
            f"{output}<|eot_id|>"
        )
        texts.append(text)
    return { "text" : texts }

# Convert JSON array to Hugging Face dataset format
raw_dataset = Dataset.from_list(dataset_json)
dataset = raw_dataset.map(format_prompts, batched = True)

# ==========================================
# 5. CONFIGURE TRAINING ARGUMENTS & SFT
# ==========================================
print("📝 Starting training configuration...")
trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 2,
    packing = False, # Can speed up training for short sequences
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 60, # Increase to 120+ for larger datasets or 2-3 full epochs
        learning_rate = 2e-4,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 1,
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "outputs",
    ),
)

# Run the training
print("🏋️‍♂️ Training model...")
trainer_stats = trainer.train()
print("🎉 Training completed!")

# ==========================================
# 6. EXPORT / SAVE WEIGHTS
# ==========================================
# Save the LoRA adapters (lightweight weights, ~50MB)
print("💾 Saving fine-tuned LoRA adapters locally...")
model.save_pretrained("lora_model")
tokenizer.save_pretrained("lora_model")

# If you have a Hugging Face token, you can merge weights to 16bit float
# and upload directly to Hugging Face Hub. This is recommended to host online!
if HUGGING_FACE_TOKEN:
    print("📤 Merging weights and uploading model to Hugging Face Hub...")
    try:
        model.push_to_hub_merged(
            HF_OUTPUT_REPOSITORY, 
            tokenizer, 
            save_method = "merged_16bit", 
            token = HUGGING_FACE_TOKEN
        )
        print(f"🚀 Success! Model available at: https://huggingface.co/{HF_OUTPUT_REPOSITORY}")
    except Exception as e:
        print(f"⚠️ Hugging Face upload failed: {e}")
        print("Model remains saved locally in the 'lora_model' folder.")
else:
    print("💡 Saving 16-bit merged model locally (this will output standard Hugging Face weights)...")
    model.save_pretrained_merged("merged_model", tokenizer, save_method = "merged_16bit")
    print("✅ Saved merged model to 'merged_model' folder.")
