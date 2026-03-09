export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { text, title } = await request.json();

      if (!text || !title) {
        return jsonResponse({ error: 'Missing text or title' }, 400);
      }

      // Truncate to ~3000 chars to stay within free tier token limits
      const truncated = text.slice(0, 3000);

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a summarizer. Given the article below, output ONLY a JSON object (no markdown, no explanation, no preamble) with exactly two fields:
{"short":"1 sentence max 30 words","long":"2-3 sentences max 80 words"}

Title: ${title}

Article:
${truncated}`
              }]
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const err = await geminiRes.text();
        return jsonResponse({ error: 'Gemini API error', detail: err }, 502);
      }

      const data = await geminiRes.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!raw) {
        return jsonResponse({ error: 'Empty Gemini response' }, 502);
      }

      // Extract JSON from Gemini's response (may include preamble text)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return jsonResponse({ error: 'No JSON in Gemini response', raw }, 502);
      }
      const summary = JSON.parse(jsonMatch[0]);

      return jsonResponse(summary);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
