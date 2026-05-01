import Groq from "groq-sdk";

try {
  const groq = new Groq({ apiKey: undefined });
  console.log("Groq initialized with undefined");
} catch (e) {
  console.log("Groq failed with undefined:", e.message);
}

try {
  const groq = new Groq({ apiKey: "" });
  console.log("Groq initialized with empty string");
} catch (e) {
  console.log("Groq failed with empty string:", e.message);
}
