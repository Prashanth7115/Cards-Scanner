import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // Initialize Gemini client lazily to avoid startup crashes if key is missing
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not defined");
      }
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  const DEMO_CARDS = [
    {
      readable: true,
      name: "Jane Doe",
      designation: "Lead AI Solutions Architect",
      mobile: "+1 (555) 302-8924",
      company: "Apex Intelligent Labs",
      address: "500 Innovation Way, Suite 1200, San Francisco, CA 94105",
      email: "jane.doe@apexlabs.ai",
      website: "www.apexlabs.ai",
      fallbackUsed: true
    },
    {
      readable: true,
      name: "Dr. Alexander Wright",
      designation: "Research Director",
      mobile: "+1 (617) 555-0149",
      company: "BioHelix Therapeutics",
      address: "75 Kendall Square, Cambridge, MA 02142",
      email: "a.wright@biohelix.org",
      website: "www.biohelix.org",
      fallbackUsed: true
    },
    {
      readable: true,
      name: "Elena Vance",
      designation: "VP of Product Engineering",
      mobile: "+1 (415) 555-2981",
      company: "Quantum Cybernetics",
      address: "101 Cybernetics Dr, Berkeley, CA 94720",
      email: "evance@quantumcyber.com",
      website: "quantumcyber.com",
      fallbackUsed: true
    },
    {
      readable: true,
      name: "Marcus Aurelius",
      designation: "Senior Investment Advisor",
      mobile: "+44 20 7946 0192",
      company: "Centurion Capital Group",
      address: "30 St Mary Axe (The Gherkin), London EC3A 8EP, UK",
      email: "marcus@centurioncap.com",
      website: "www.centurioncap.com",
      fallbackUsed: true
    }
  ];

  // API scan endpoint
  app.post("/api/scan", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;
      if (!frontImage) {
        return res.status(400).json({ error: "Front image is required" });
      }

      let ai;
      try {
        ai = getGeminiClient();
      } catch (e: any) {
        console.warn("[AI SCAN] Gemini client failed to initialize or missing API Key. Falling back to dynamic mock card.");
        const randomIdx = Math.floor(Math.random() * DEMO_CARDS.length);
        return res.json({
          ...DEMO_CARDS[randomIdx],
          fallbackUsed: true,
          fallbackReason: "key_missing"
        });
      }

      const parts: any[] = [];
      
      const cleanBase64 = (base64Str: string) => {
        const parts = base64Str.split(",");
        return parts.length > 1 ? parts[1] : parts[0];
      };

      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64(frontImage)
        }
      });

      if (backImage) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: cleanBase64(backImage)
          }
        });
      }

      parts.push({
        text: "Analyze the attached business card / visiting card / brochure image(s). First, check if the image is clear and readable. If it is blurry, out of focus, or does not contain readable contact or business cards, set 'readable' to false. Otherwise set 'readable' to true and extract the details. Do not guess or make up data: only extract original text found on the card. For empty, missing or not found elements, return empty string."
      });

      let response;
      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        let backoffDelay = 1000;
        const maxRetries = 2;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[AI SCAN] Attempting scan with model: ${modelName} (Attempt ${attempt})...`);
            response = await ai.models.generateContent({
              model: modelName,
              contents: { parts },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    readable: {
                      type: Type.BOOLEAN,
                      description: "Whether the card is clear, in-focus, legible, and contains valid contact details. Set to FALSE if blurry, illegible, dark, cut-off, or completely irrelevant. Otherwise TRUE."
                    },
                    name: {
                      type: Type.STRING,
                      description: "The full name of the contact person."
                    },
                    designation: {
                      type: Type.STRING,
                      description: "Job title or role (e.g., CEO, Developer, Manager)."
                    },
                    mobile: {
                      type: Type.STRING,
                      description: "Phone numbers found on the card, formatted nicely. If multiple, separate by comma."
                    },
                    company: {
                      type: Type.STRING,
                      description: "The company or organization name."
                    },
                    address: {
                      type: Type.STRING,
                      description: "The physical address or location."
                    },
                    email: {
                      type: Type.STRING,
                      description: "The email address."
                    },
                    website: {
                      type: Type.STRING,
                      description: "The website URL."
                    }
                  },
                  required: ["readable", "name", "designation", "mobile", "company", "address", "email", "website"]
                }
              }
            });
            break;
          } catch (err: any) {
            lastError = err;
            const errMsg = err?.message || String(err);
            const isRetryable = errMsg.includes("503") || 
                                errMsg.includes("504") || 
                                errMsg.includes("429") || 
                                errMsg.includes("UNAVAILABLE") || 
                                errMsg.includes("demand") ||
                                errMsg.includes("quota") ||
                                errMsg.includes("RESOURCE_EXHAUSTED");
            
            if (isRetryable && attempt < maxRetries) {
              console.warn(`[AI SCAN] Model ${modelName} attempt ${attempt} failed with retryable error: ${errMsg}. Retrying in ${backoffDelay}ms...`);
              await new Promise((resolve) => setTimeout(resolve, backoffDelay));
              backoffDelay *= 1.5;
            } else {
              console.error(`[AI SCAN] Model ${modelName} failed on attempt ${attempt}:`, errMsg);
              break;
            }
          }
        }

        if (response) {
          break;
        }
      }

      if (!response) {
        console.warn("[AI SCAN] All live Gemini models failed (could be quota exhaustion or rate limits). Returning a dynamic robust fallback contact so the app remains testable.");
        const randomIdx = Math.floor(Math.random() * DEMO_CARDS.length);
        return res.json({
          ...DEMO_CARDS[randomIdx],
          fallbackUsed: true,
          fallbackReason: lastError?.message || "Model high demand / quota limits reached"
        });
      }

      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini");
      }

      const data = JSON.parse(text);
      return res.json(data);
    } catch (error: any) {
      console.error("Scanning error, returning fallback instead of failing:", error);
      const randomIdx = Math.floor(Math.random() * DEMO_CARDS.length);
      return res.json({
        ...DEMO_CARDS[randomIdx],
        fallbackUsed: true,
        fallbackReason: error?.message || "Generic server-side scanning failure"
      });
    }
  });

  // Serve static UI / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
