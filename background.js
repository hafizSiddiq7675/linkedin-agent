chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ANALYZE_TEXT') {
        handleAnalysis(request).then(sendResponse);
        return true; // Keep channel open for async response
    } else if (request.action === 'DOWNLOAD') {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('Download failed:', chrome.runtime.lastError);
                sendResponse({ status: 'failed', error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ status: 'success', downloadId: downloadId });
            }
        });
        return true;
    }
});

async function handleAnalysis(data) {
    const { provider, apiKey, prompt, text, ollamaEndpoint, ollamaModel } = data;
    const fullPrompt = `${prompt}\n\nMessage: "${text}"\n\nAnswer:`;

    try {
        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: prompt },
                        { role: "user", content: text }
                    ],
                    temperature: 0
                })
            });
            const json = await response.json();
            const content = json.choices[0].message.content.trim().toUpperCase();
            return { isPositive: content.includes('YES') };
        }
        else if (provider === 'gemini') {
            // Use Gemini for sentiment/intent analysis
            const sentimentPrompt = `Analyze the sentiment and intent of this LinkedIn message. Reply with ONLY ONE WORD: positive, negative, or neutral.

Rules:
- "positive" = interested, wants to meet, asking for info, positive tone
- "negative" = not interested, declining, busy, negative tone
- "neutral" = generic response, unclear intent

Message: "${text}"

Answer (one word only):`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: sentimentPrompt }] }]
                })
            });
            const json = await response.json();
            if (json.error) {
                console.error('Gemini API Error Details:', JSON.stringify(json.error, null, 2));
                return { error: json.error.message || JSON.stringify(json.error) };
            }

            const content = json.candidates[0].content.parts[0].text.trim().toLowerCase();
            console.log('Gemini Analysis Result:', content);

            // Determine if positive
            const isPositive = content.includes('positive');

            // Extract sentiment label
            let sentiment = 'neutral';
            if (content.includes('positive')) sentiment = 'positive';
            else if (content.includes('negative')) sentiment = 'negative';

            return {
                isPositive: isPositive,
                sentiment: sentiment,
                confidence: 0.9
            };
        }
        else if (provider === 'ollama') {
            const endpoint = ollamaEndpoint || 'http://localhost:11434';
            const model = ollamaModel || 'llama3';

            // Use /api/generate for simple completion or /api/chat
            const response = await fetch(`${endpoint}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: fullPrompt,
                    stream: false
                })
            });
            const json = await response.json();
            const content = json.response.trim().toUpperCase();
            return { isPositive: content.includes('YES') };
        }
        else if (provider === 'huggingface') {
            // Use sentiment analysis model for better intent detection
            const response = await fetch('https://router.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    inputs: text,
                    options: {
                        wait_for_model: true
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Hugging Face HTTP Error:', response.status, errorText);
                return { error: `HTTP ${response.status}: ${errorText}` };
            }

            const json = await response.json();
            console.log('Hugging Face Response:', json);

            if (json.error) {
                console.error('Hugging Face API Error:', json.error);
                return { error: json.error };
            }

            // HF sentiment model returns: [[{label: "positive", score: 0.99}, {label: "negative", score: 0.01}, ...]]
            if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0])) {
                const results = json[0];
                // Find the highest scoring label
                const sorted = results.sort((a, b) => b.score - a.score);
                const topResult = sorted[0];

                console.log('HF Analysis Result:', topResult);

                // Return positive if sentiment is positive or neutral (for sales, neutral can mean interested)
                const isPositive = topResult.label.toLowerCase() === 'positive';

                return {
                    isPositive: isPositive,
                    sentiment: topResult.label,
                    confidence: topResult.score
                };
            } else {
                console.error('Unexpected HF response format:', json);
                return { error: 'Unexpected response format from Hugging Face' };
            }
        }
    } catch (e) {
        console.error('Background Analysis Error:', e);
        return { error: e.message };
    }

    return { error: 'Unknown provider' };
}
