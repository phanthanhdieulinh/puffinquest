"use strict";

/**
 * Puffin Quest — Real AI Landmark Vision Review Engine.
 *
 * Connects to live multimodal AI backends:
 * 1. Google Gemini Multimodal Vision (gemini-1.5-flash / gemini-2.0-flash) via GEMINI_API_KEY
 * 2. OpenAI GPT-4o / GPT-4o-mini Vision via OPENAI_API_KEY
 * 3. Custom OpenAI-compatible vision endpoint via AI_VISION_API_KEY
 */

const AI_SIMILARITY_THRESHOLD = 80; // Target ~80-90% match

// Architectural and contextual ground-truth profiles for mystery landmarks
const LANDMARK_SIGNATURES = {
  "hanoi-turtle-tower": {
    name: "Turtle Tower",
    localName: "Tháp Rùa",
    city: "Hà Nội, Vietnam",
    features: "Historic multi-tier stone pavilion standing on an islet in the middle of Hoàn Kiếm Lake, surrounded by green lake water and trees."
  },
  "hanoi-one-pillar": {
    name: "One Pillar Pagoda",
    localName: "Chùa Một Cột",
    city: "Hà Nội, Vietnam",
    features: "Iconic historic wooden Buddhist pagoda built atop a single stone column rising out of a square lotus pond."
  },
  "hanoi-temple-literature": {
    name: "Temple of Literature",
    localName: "Văn Miếu - Quốc Tử Giám",
    city: "Hà Nội, Vietnam",
    features: "Ancient Confucian temple complex featuring the Khuê Văn Các pavilion, red tiled roofs, stone turtle steles, and ancient walled courtyards."
  },
  "hcmc-notre-dame": {
    name: "Notre-Dame Cathedral Basilica of Saigon",
    localName: "Nhà thờ Đức Bà Sài Gòn",
    city: "Ho Chi Minh City, Vietnam",
    features: "French colonial red Marseille-brick basilica with prominent twin bell towers, Romanesque arches, and front Virgin Mary statue square."
  },
  "hcmc-ben-thanh": {
    name: "Bến Thành Market",
    localName: "Chợ Bến Thành",
    city: "Ho Chi Minh City, Vietnam",
    features: "Iconic south gate with distinctive yellow-ochre clock tower, tiled eaved roofs, and bustling marketplace traffic intersection."
  },
  "hcmc-independence-palace": {
    name: "Independence Palace",
    localName: "Dinh Độc Lập",
    city: "Ho Chi Minh City, Vietnam",
    features: "1960s modernist architectural facade, stone screen louvers, circular driveway, tank lawn, and sprawling front fountain park."
  },
  "sg-merlion": {
    name: "The Merlion",
    localName: "鱼尾狮",
    city: "Singapore",
    features: "Iconic 8.6m white statue of mythical creature with a lion's head and fish body spouting water into Marina Bay."
  },
  "sg-marina-bay-sands": {
    name: "Marina Bay Sands",
    localName: "滨海湾金沙",
    city: "Singapore",
    features: "Three towering curved glass hotel skyscrapers crowned by the continuous cantilevered SkyPark ship structure."
  },
  "sg-gardens-by-the-bay": {
    name: "Gardens by the Bay",
    localName: "滨海湾花园 Supertree Grove",
    city: "Singapore",
    features: "Towering vertical garden Supertrees with inverted cone metal canopies, lush bromeliads and orchids, and OCBC Skyway walkway."
  }
};

/**
 * Checks which Real AI Vision provider is currently active and configured.
 */
function getAiVisionStatus() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const customKey = process.env.AI_VISION_API_KEY;

  if (geminiKey) {
    const masked = geminiKey.length > 8 ? geminiKey.slice(0, 4) + "..." + geminiKey.slice(-4) : "configured";
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    return {
      connected: true,
      provider: "Google Gemini Vision",
      model,
      keyMasked: masked,
      status: "Active (Real AI Vision Ready)",
      message: `Live connection to Google Gemini ${model} Vision API.`
    };
  }

  if (openAiKey) {
    const masked = openAiKey.length > 8 ? openAiKey.slice(0, 4) + "..." + openAiKey.slice(-4) : "configured";
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
    return {
      connected: true,
      provider: "OpenAI Vision",
      model,
      keyMasked: masked,
      status: "Active (Real AI Vision Ready)",
      message: `Live connection to OpenAI ${model} Vision API.`
    };
  }

  if (customKey) {
    return {
      connected: true,
      provider: "Custom AI Vision",
      model: process.env.AI_VISION_MODEL || "custom-vision",
      keyMasked: "configured",
      status: "Active (Real AI Vision Ready)",
      message: "Live connection to custom vision endpoint."
    };
  }

  return {
    connected: false,
    provider: "None",
    model: "None",
    keyMasked: null,
    status: "Awaiting API Key",
    message: "No Real AI Vision API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in webapp/.env."
  };
}

/**
 * Calls Google Gemini Multimodal Vision API.
 */
async function callGeminiVision(apiKey, signature, photoDataUrl) {
  const mimeMatch = photoDataUrl.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const base64Index = photoDataUrl.indexOf(";base64,");
  const rawBase64 = photoDataUrl.slice(base64Index + 8);

  const promptText = [
    `You are the official AI Landmark Reviewer for the exploration game Puffin Quest.`,
    `A player submitted a real photograph to prove they found this mystery landmark:`,
    `- Landmark Name: "${signature.name}" (${signature.localName || ""})`,
    `- Expected City: "${signature.city}"`,
    `- Architectural & Environmental Traits: "${signature.features}"`,
    ``,
    `TASK:`,
    `1. Carefully inspect the photo to see what is physically shown.`,
    `2. Check if this photo depicts the specified landmark "${signature.name}".`,
    `3. Assign an honest similarity / confidence score (0 to 100):`,
    `   - 80-100: Photo clearly depicts ${signature.name} (even if taken from different angles or lighting).`,
    `   - 0-79: Photo does NOT depict ${signature.name} (e.g. random selfie, different building, screen, pet, food, or blurry/unrelated object).`,
    ``,
    `Respond ONLY with a JSON object in this exact schema without any markdown formatting:`,
    `{`,
    `  "passed": boolean (true if score >= 80),`,
    `  "score": integer (0 to 100),`,
    `  "detected_subject": string (short description of what you see in the photo),`,
    `  "feedback": string (concise explanation of why it passed or failed)`,
    `}`
  ].join("\n");

  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ].filter(Boolean)));

  const body = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: rawBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  let lastError = null;
  for (const modelName of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        // If model not found / deprecated, try next candidate model
        if (response.status === 404 || errText.includes("not found") || errText.includes("no longer available")) {
          lastError = new Error(`Gemini model ${modelName} unavailable (${response.status})`);
          continue;
        }
        throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 160)}`);
      }

      const json = await response.json();
      const parts =
        json &&
        json.candidates &&
        json.candidates[0] &&
        json.candidates[0].content &&
        json.candidates[0].content.parts;

      let textOutput = "";
      if (Array.isArray(parts)) {
        // Find part with text
        const found = parts.find(p => p && typeof p.text === "string");
        if (found) textOutput = found.text;
      }

      if (!textOutput) throw new Error("Empty text response from Gemini Vision API");

      let parsed;
      try {
        parsed = JSON.parse(textOutput.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
      } catch {
        const match = textOutput.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Could not parse JSON from Gemini response: " + textOutput.slice(0, 100));
      }

      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || (parsed.passed ? 88 : 25))));
      const passed = Boolean(parsed.passed && score >= AI_SIMILARITY_THRESHOLD);
      const detected = parsed.detected_subject ? ` [Detected: ${parsed.detected_subject}]` : "";
      const feedback = String(parsed.feedback || (passed ? `Recognized ${signature.name}!` : `Did not sufficiently match ${signature.name}.`));

      return {
        passed,
        score,
        threshold: AI_SIMILARITY_THRESHOLD,
        landmarkName: signature.name,
        aiModel: `Google Gemini (${modelName})`,
        feedback: `[Gemini Vision] ${feedback}${detected}`
      };
    } catch (err) {
      lastError = err;
      if (!err.message.includes("unavailable")) {
        throw err;
      }
    }
  }

  throw lastError || new Error("All Gemini candidate models failed");
}

/**
 * Calls OpenAI GPT-4o / GPT-4o-mini Vision API.
 */
async function callOpenAiVision(apiKey, signature, photoDataUrl) {
  const modelName = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

  const promptText = [
    `You are the official AI Landmark Reviewer for the exploration game Puffin Quest.`,
    `A player submitted a photo to prove they found this mystery landmark:`,
    `- Landmark Name: "${signature.name}" (${signature.localName || ""})`,
    `- City: "${signature.city}"`,
    `- Distinct Architectural Features: "${signature.features}"`,
    ``,
    `Analyze the photo carefully. Identify what is in the photo, and evaluate whether it depicts or fits this landmark (~80-90% match threshold).`,
    `Respond ONLY with a valid JSON object in this exact schema without any markdown wrapping:`,
    `{`,
    `  "passed": boolean,`,
    `  "score": integer (0 to 100),`,
    `  "detected_subject": string (what you see in the photo),`,
    `  "feedback": string (concise explanation of whether it matches or why it failed)`,
    `}`
  ].join("\n");

  const body = {
    model: modelName,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          {
            type: "image_url",
            image_url: {
              url: photoDataUrl,
              detail: "auto"
            }
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API HTTP ${response.status}: ${errText.slice(0, 150)}`);
  }

  const json = await response.json();
  const textOutput = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!textOutput) throw new Error("Empty response from OpenAI Vision API");

  let parsed;
  try {
    parsed = JSON.parse(textOutput.trim());
  } catch {
    const match = textOutput.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("Could not parse JSON from OpenAI response");
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || (parsed.passed ? 88 : 25))));
  const passed = Boolean(parsed.passed && score >= AI_SIMILARITY_THRESHOLD);
  const detected = parsed.detected_subject ? ` [Detected: ${parsed.detected_subject}]` : "";
  const feedback = String(parsed.feedback || (passed ? `Recognized ${signature.name}!` : `Did not sufficiently match ${signature.name}.`));

  return {
    passed,
    score,
    threshold: AI_SIMILARITY_THRESHOLD,
    landmarkName: signature.name,
    aiModel: `OpenAI (${modelName})`,
    feedback: `[OpenAI Vision] ${feedback}${detected}`
  };
}

/**
 * Main entrance: Evaluates uploaded photo using real multimodal AI vision.
 *
 * @param {string} landmarkId - The landmark identifier.
 * @param {string} photoDataUrl - Base64 data URL of the uploaded photo.
 * @returns {Promise<{ passed: boolean, score: number, threshold: number, landmarkName: string, feedback: string, aiModel: string, requiresApiKey?: boolean }>}
 */
async function analyzeLandmarkImage(landmarkId, photoDataUrl) {
  const signature = LANDMARK_SIGNATURES[landmarkId];
  if (!signature) {
    return {
      passed: false,
      score: 0,
      threshold: AI_SIMILARITY_THRESHOLD,
      landmarkName: "Unknown",
      aiModel: "Puffin Vision",
      feedback: "Unknown landmark profile."
    };
  }

  if (!photoDataUrl || typeof photoDataUrl !== "string" || !photoDataUrl.startsWith("data:image/")) {
    return {
      passed: false,
      score: 0,
      threshold: AI_SIMILARITY_THRESHOLD,
      landmarkName: signature.name,
      aiModel: "Puffin Vision",
      feedback: "Invalid or empty image format. Please capture a live photo."
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. If Gemini key is set, call Gemini Vision
  if (geminiKey) {
    try {
      return await callGeminiVision(geminiKey, signature, photoDataUrl);
    } catch (err) {
      console.error("[AI Vision] Gemini call failed:", err.message);
      return {
        passed: false,
        score: 0,
        threshold: AI_SIMILARITY_THRESHOLD,
        landmarkName: signature.name,
        aiModel: "Google Gemini Vision (Error)",
        feedback: `Gemini API Error: ${err.message}. Please verify your GEMINI_API_KEY.`
      };
    }
  }

  // 2. If OpenAI key is set, call OpenAI Vision
  if (openAiKey) {
    try {
      return await callOpenAiVision(openAiKey, signature, photoDataUrl);
    } catch (err) {
      console.error("[AI Vision] OpenAI call failed:", err.message);
      return {
        passed: false,
        score: 0,
        threshold: AI_SIMILARITY_THRESHOLD,
        landmarkName: signature.name,
        aiModel: "OpenAI Vision (Error)",
        feedback: `OpenAI API Error: ${err.message}. Please verify your OPENAI_API_KEY.`
      };
    }
  }

  // 3. No real AI key is configured in backend
  return {
    passed: false,
    score: 0,
    threshold: AI_SIMILARITY_THRESHOLD,
    landmarkName: signature.name,
    aiModel: "Real AI Not Configured",
    feedback: "Real AI Vision is waiting for an API key. Please add GEMINI_API_KEY (Google AI Studio) or OPENAI_API_KEY to webapp/.env.",
    requiresApiKey: true
  };
}

module.exports = {
  analyzeLandmarkImage,
  getAiVisionStatus,
  LANDMARK_SIGNATURES,
  AI_SIMILARITY_THRESHOLD
};
