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

  // API scan endpoint
  app.post("/api/scan", async (req, res) => {
    try {
      const { frontImage, backImage } = req.body;
      if (!frontImage) {
        return res.status(400).json({ error: "Front image is required" });
      }

      const ai = getGeminiClient();
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
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest"];
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
                                errMsg.includes("demand");
            
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
        throw lastError || new Error("All model attempts failed due to model high demand.");
      }

      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini");
      }

      const data = JSON.parse(text);
      return res.json(data);
    } catch (error: any) {
      console.error("Scanning error:", error);
      return res.status(500).json({ error: error.message || "An error occurred while scanning the card." });
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
