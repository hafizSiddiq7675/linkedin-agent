chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ANALYZE_TEXT') {
        handleAnalysis(request).then(sendResponse);
        return true; // Keep channel open for async response
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
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }]
                })
            });
            const json = await response.json();
            const content = json.candidates[0].content.parts[0].text.trim().toUpperCase();
            return { isPositive: content.includes('YES') };
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
    } catch (e) {
        console.error('Background Analysis Error:', e);
        return { error: e.message };
    }

    return { error: 'Unknown provider' };
}
