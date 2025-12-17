# Groq Integration Plan for LinkedIn Sales Navigator Agent

## Executive Summary

This document outlines the comprehensive action plan for integrating Groq as an AI provider for sentiment analysis of LinkedIn messages. Groq offers free API calls with blazing-fast inference speeds (up to 500 tokens/second), making it an ideal choice for real-time message analysis.

---

## Table of Contents

1. [Why Groq?](#1-why-groq)
2. [Groq API Overview](#2-groq-api-overview)
3. [Implementation Phases](#3-implementation-phases)
4. [Technical Specifications](#4-technical-specifications)
5. [File Modifications](#5-file-modifications)
6. [Testing Strategy](#6-testing-strategy)
7. [Rollout Plan](#7-rollout-plan)
8. [Risk Assessment](#8-risk-assessment)

---

## 1. Why Groq?

### 1.1 Benefits

| Feature | Benefit |
|---------|---------|
| **Free Tier** | 14,400 requests/day (10 requests/minute) |
| **Speed** | Up to 500 tokens/second - fastest inference available |
| **Quality Models** | Access to LLaMA 3.3 70B, Mixtral, Gemma 2 |
| **OpenAI Compatible** | Similar API structure - easy migration |
| **Cost Effective** | Even paid tier is significantly cheaper than OpenAI |
| **Low Latency** | Sub-second response times for sentiment analysis |

### 1.2 Free Tier Limits (as of 2024)

| Model | Requests/Min | Requests/Day | Tokens/Min |
|-------|--------------|--------------|------------|
| llama-3.3-70b-versatile | 30 | 14,400 | 6,000 |
| llama-3.1-8b-instant | 30 | 14,400 | 20,000 |
| mixtral-8x7b-32768 | 30 | 14,400 | 5,000 |
| gemma2-9b-it | 30 | 14,400 | 15,000 |

### 1.3 Recommended Model for Sentiment Analysis

**Primary:** `llama-3.1-8b-instant`
- Fast inference
- High token limit (20,000/min)
- Good accuracy for classification tasks
- Optimal for binary/ternary sentiment analysis

**Fallback:** `gemma2-9b-it`
- Similar performance
- Higher accuracy for nuanced sentiment

---

## 2. Groq API Overview

### 2.1 API Endpoint

```
https://api.groq.com/openai/v1/chat/completions
```

### 2.2 Authentication

```javascript
headers: {
  'Authorization': 'Bearer GROQ_API_KEY',
  'Content-Type': 'application/json'
}
```

### 2.3 Request Format

```javascript
{
  "model": "llama-3.1-8b-instant",
  "messages": [
    {
      "role": "system",
      "content": "You are a sales assistant..."
    },
    {
      "role": "user",
      "content": "Analyze this message: ..."
    }
  ],
  "temperature": 0,
  "max_tokens": 10,
  "stream": false
}
```

### 2.4 Response Format

```javascript
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "llama-3.1-8b-instant",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "YES"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 1,
    "total_tokens": 51
  }
}
```

---

## 3. Implementation Phases

### Phase 1: Core Integration

**Objective:** Add Groq as a new AI provider option

**Tasks:**

- [ ] **1.1** Add Groq API endpoint to `manifest.json` host permissions
- [ ] **1.2** Create Groq handler function in `background.js`
- [ ] **1.3** Add Groq option to provider dropdown in `options.html`
- [ ] **1.4** Add Groq model selector in options UI
- [ ] **1.5** Update `options.js` to save Groq settings

### Phase 2: UI/UX Enhancements

**Objective:** Provide seamless user experience for Groq configuration

**Tasks:**

- [ ] **2.1** Add Groq API key input field in options
- [ ] **2.2** Add model selection dropdown (8b-instant, 70b-versatile, mixtral)
- [ ] **2.3** Add rate limit indicator/warning
- [ ] **2.4** Add "Get Free API Key" link to Groq console
- [ ] **2.5** Update popup.js to show Groq as active provider

### Phase 3: Optimization & Rate Limiting

**Objective:** Handle Groq's rate limits gracefully

**Tasks:**

- [ ] **3.1** Implement request queue with rate limiting
- [ ] **3.2** Add exponential backoff for 429 errors
- [ ] **3.3** Add request counter and daily limit tracking
- [ ] **3.4** Implement batch processing for multiple messages
- [ ] **3.5** Add automatic fallback to other providers on rate limit

### Phase 4: Advanced Features

**Objective:** Maximize Groq's capabilities

**Tasks:**

- [ ] **4.1** Implement bulk message analysis (batch API)
- [ ] **4.2** Add streaming support for real-time feedback
- [ ] **4.3** Add sentiment confidence scores
- [ ] **4.4** Create Groq-specific optimized prompts
- [ ] **4.5** Add usage statistics dashboard

---

## 4. Technical Specifications

### 4.1 Groq Handler Function

```javascript
// background.js - Add this handler
async function analyzeWithGroq(text, apiKey, systemPrompt, model = 'llama-3.1-8b-instant') {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a sales assistant. Analyze the following LinkedIn message. If the user is interested, asking for a meeting, or wants more info, reply "YES". If they are not interested, saying no, or it is a generic auto-reply, reply "NO". Reply ONLY with YES or NO.'
        },
        {
          role: 'user',
          content: `Analyze this message: "${text}"`
        }
      ],
      temperature: 0,
      max_tokens: 10,
      stream: false
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Groq API error');
  }

  const data = await response.json();
  const result = data.choices[0]?.message?.content?.trim().toUpperCase();

  return {
    isPositive: result === 'YES',
    sentiment: result === 'YES' ? 'positive' : 'negative',
    model: data.model,
    usage: data.usage
  };
}
```

### 4.2 Rate Limiter Implementation

```javascript
// utils/rateLimiter.js
class GroqRateLimiter {
  constructor() {
    this.requests = [];
    this.maxRequestsPerMinute = 30;
    this.maxRequestsPerDay = 14400;
    this.dailyCount = 0;
    this.lastReset = Date.now();
  }

  async canMakeRequest() {
    this.cleanOldRequests();
    this.checkDailyReset();

    if (this.dailyCount >= this.maxRequestsPerDay) {
      return { allowed: false, reason: 'daily_limit', retryAfter: this.getTimeUntilReset() };
    }

    if (this.requests.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requests[0];
      const waitTime = 60000 - (Date.now() - oldestRequest);
      return { allowed: false, reason: 'rate_limit', retryAfter: waitTime };
    }

    return { allowed: true };
  }

  recordRequest() {
    this.requests.push(Date.now());
    this.dailyCount++;
  }

  cleanOldRequests() {
    const oneMinuteAgo = Date.now() - 60000;
    this.requests = this.requests.filter(time => time > oneMinuteAgo);
  }

  checkDailyReset() {
    const now = Date.now();
    if (now - this.lastReset >= 86400000) {
      this.dailyCount = 0;
      this.lastReset = now;
    }
  }

  getTimeUntilReset() {
    return 86400000 - (Date.now() - this.lastReset);
  }
}
```

### 4.3 Enhanced Sentiment Prompt for Groq

```javascript
const GROQ_SENTIMENT_PROMPT = `You are an expert sales intent analyzer. Analyze the LinkedIn message and determine the sender's intent.

Classification Rules:
- POSITIVE: Interest in product/service, requesting demo/call/meeting, asking for pricing/details, expressing need for solution
- NEGATIVE: Explicit rejection, unsubscribe request, not interested, wrong contact
- NEUTRAL: Auto-replies, out-of-office, acknowledgments without clear intent, questions requiring clarification

Respond with exactly one word: POSITIVE, NEGATIVE, or NEUTRAL

Message to analyze:`;
```

### 4.4 Available Groq Models

```javascript
const GROQ_MODELS = {
  'llama-3.1-8b-instant': {
    name: 'LLaMA 3.1 8B Instant',
    description: 'Fast, efficient, best for quick sentiment analysis',
    contextWindow: 128000,
    recommended: true
  },
  'llama-3.3-70b-versatile': {
    name: 'LLaMA 3.3 70B Versatile',
    description: 'Most capable, best for complex analysis',
    contextWindow: 128000,
    recommended: false
  },
  'mixtral-8x7b-32768': {
    name: 'Mixtral 8x7B',
    description: 'Balanced performance and quality',
    contextWindow: 32768,
    recommended: false
  },
  'gemma2-9b-it': {
    name: 'Gemma 2 9B',
    description: 'Google model, good for classification',
    contextWindow: 8192,
    recommended: false
  }
};
```

---

## 5. File Modifications

### 5.1 manifest.json

**Changes Required:**

```json
{
  "host_permissions": [
    "http://localhost/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://router.huggingface.co/*",
    "https://api.groq.com/*"  // ADD THIS LINE
  ]
}
```

### 5.2 background.js

**Changes Required:**

1. Add `analyzeWithGroq()` function (see 4.1)
2. Add Groq case to `handleAnalysis()` switch statement:

```javascript
case 'groq':
  const groqResult = await analyzeWithGroq(
    data.text,
    data.apiKey,
    data.prompt,
    data.groqModel || 'llama-3.1-8b-instant'
  );
  return {
    isPositive: groqResult.isPositive,
    sentiment: groqResult.sentiment,
    provider: 'groq',
    model: groqResult.model
  };
```

### 5.3 options.html

**Changes Required:**

Add Groq option to provider dropdown:

```html
<option value="groq">Groq (Free - Fast LLaMA)</option>
```

Add Groq-specific settings section:

```html
<div id="groq-settings" class="provider-settings" style="display: none;">
  <div class="form-group">
    <label for="groq-api-key">Groq API Key</label>
    <input type="password" id="groq-api-key" placeholder="gsk_...">
    <small>
      <a href="https://console.groq.com/keys" target="_blank">Get free API key</a>
    </small>
  </div>
  <div class="form-group">
    <label for="groq-model">Model</label>
    <select id="groq-model">
      <option value="llama-3.1-8b-instant" selected>LLaMA 3.1 8B (Fastest)</option>
      <option value="llama-3.3-70b-versatile">LLaMA 3.3 70B (Best Quality)</option>
      <option value="mixtral-8x7b-32768">Mixtral 8x7B (Balanced)</option>
      <option value="gemma2-9b-it">Gemma 2 9B (Good for Classification)</option>
    </select>
  </div>
  <div class="rate-limit-info">
    <span class="icon">ℹ️</span>
    <span>Free tier: 30 requests/min, 14,400 requests/day</span>
  </div>
</div>
```

### 5.4 options.js

**Changes Required:**

1. Add Groq settings to save/load functions:

```javascript
// In saveSettings()
groqApiKey: document.getElementById('groq-api-key').value,
groqModel: document.getElementById('groq-model').value,

// In loadSettings()
document.getElementById('groq-api-key').value = settings.groqApiKey || '';
document.getElementById('groq-model').value = settings.groqModel || 'llama-3.1-8b-instant';
```

2. Add Groq visibility toggle:

```javascript
function toggleProviderSettings(provider) {
  // ... existing code ...
  document.getElementById('groq-settings').style.display =
    provider === 'groq' ? 'block' : 'none';
}
```

### 5.5 content.js

**Changes Required:**

Update message sending to include Groq model:

```javascript
// In analyzeMessage function
const response = await chrome.runtime.sendMessage({
  action: 'ANALYZE_TEXT',
  text: messageText,
  provider: settings.aiProvider,
  apiKey: settings.aiProvider === 'groq' ? settings.groqApiKey : settings.apiKey,
  prompt: settings.customPrompt,
  groqModel: settings.groqModel  // ADD THIS
});
```

### 5.6 popup.js

**Changes Required:**

Add Groq to provider display:

```javascript
function getProviderDisplayName(provider) {
  const names = {
    openai: 'OpenAI GPT-3.5',
    gemini: 'Google Gemini',
    ollama: 'Ollama (Local)',
    huggingface: 'HuggingFace',
    chrome: 'Chrome Built-in AI',
    groq: 'Groq (LLaMA)'  // ADD THIS
  };
  return names[provider] || provider;
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Test Case | Expected Result |
|-----------|-----------------|
| Valid API key with positive message | Returns `{ isPositive: true, sentiment: 'positive' }` |
| Valid API key with negative message | Returns `{ isPositive: false, sentiment: 'negative' }` |
| Invalid API key | Throws authentication error |
| Rate limit exceeded | Returns 429 with retry-after header |
| Empty message | Handles gracefully, returns neutral |
| Very long message | Truncates appropriately |

### 6.2 Integration Tests

| Test Scenario | Steps | Expected Outcome |
|---------------|-------|------------------|
| Full scraping flow | Enable Groq, scrape 10 messages | All messages analyzed correctly |
| Provider switching | Switch from OpenAI to Groq mid-session | Seamless transition |
| Rate limit handling | Send 35 requests in 1 minute | Queues requests, no failures |
| Fallback mechanism | Exceed daily limit | Falls back to configured backup |

### 6.3 Test Messages Dataset

```javascript
const TEST_MESSAGES = [
  // Positive
  { text: "Yes, I'd love to learn more. Can we schedule a call?", expected: 'positive' },
  { text: "This sounds interesting. Send me the pricing details.", expected: 'positive' },
  { text: "Let's set up a demo for next week.", expected: 'positive' },

  // Negative
  { text: "No thanks, we're not interested at this time.", expected: 'negative' },
  { text: "Please remove me from your list.", expected: 'negative' },
  { text: "We already have a solution in place.", expected: 'negative' },

  // Neutral
  { text: "Thanks for reaching out.", expected: 'neutral' },
  { text: "I'm out of office until Monday.", expected: 'neutral' },
  { text: "Got it, thanks.", expected: 'neutral' }
];
```

---

## 7. Rollout Plan

### Stage 1: Development (Week 1)

- [ ] Implement core Groq handler
- [ ] Add manifest.json permissions
- [ ] Create options UI elements
- [ ] Write unit tests

### Stage 2: Internal Testing (Week 2)

- [ ] Test with real LinkedIn messages
- [ ] Verify rate limiting works
- [ ] Test fallback mechanisms
- [ ] Performance benchmarking

### Stage 3: Beta Release (Week 3)

- [ ] Release to beta testers
- [ ] Collect feedback
- [ ] Monitor error rates
- [ ] Fine-tune prompts

### Stage 4: Full Release (Week 4)

- [ ] Update documentation
- [ ] Publish to extension stores
- [ ] Monitor usage metrics
- [ ] Address user feedback

---

## 8. Risk Assessment

### 8.1 Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Groq rate limits hit frequently | Medium | High | Implement smart queuing, fallback providers |
| API changes by Groq | Low | High | Abstract API calls, monitor changelogs |
| Model quality inconsistency | Low | Medium | Allow model switching, use confidence thresholds |
| Free tier discontinued | Low | High | Support paid tier, maintain other providers |
| Slow response under load | Medium | Medium | Use fastest model (8b-instant), implement timeouts |

### 8.2 Fallback Strategy

```javascript
const PROVIDER_FALLBACK_ORDER = [
  'groq',           // Primary (free, fast)
  'gemini',         // Secondary (free tier available)
  'ollama',         // Tertiary (local, no limits)
  'huggingface',    // Quaternary (free tier)
  'openai'          // Last resort (paid)
];

async function analyzeWithFallback(text, settings) {
  for (const provider of PROVIDER_FALLBACK_ORDER) {
    try {
      const result = await analyzeWithProvider(provider, text, settings);
      return result;
    } catch (error) {
      if (error.code === 'RATE_LIMIT') {
        console.log(`${provider} rate limited, trying next provider...`);
        continue;
      }
      throw error;
    }
  }
  throw new Error('All providers exhausted');
}
```

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Success Rate | > 99% | Successful requests / Total requests |
| Average Response Time | < 500ms | Time from request to response |
| Sentiment Accuracy | > 90% | Manual verification of 100 samples |
| User Adoption | > 50% | Users selecting Groq as provider |
| Cost Savings | 100% vs OpenAI | $0 for free tier usage |

---

## 10. Future Enhancements

### 10.1 Batch Processing

Implement batch API calls to analyze multiple messages in single request:

```javascript
async function batchAnalyze(messages) {
  // Group messages into batches of 5
  const batches = chunkArray(messages, 5);

  for (const batch of batches) {
    const prompt = batch.map((m, i) => `[${i+1}] ${m}`).join('\n');
    // Single API call for batch
    const result = await analyzeWithGroq(prompt, apiKey, BATCH_PROMPT);
    // Parse individual results
  }
}
```

### 10.2 Streaming for Real-time Feedback

```javascript
async function analyzeWithStreaming(text, apiKey, onToken) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    // ... config ...
    body: JSON.stringify({ ...config, stream: true })
  });

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(new TextDecoder().decode(value));
  }
}
```

### 10.3 Confidence Scoring

Add confidence scores to sentiment analysis:

```javascript
const CONFIDENCE_PROMPT = `Analyze the message and respond in JSON format:
{
  "sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;
```

---

## Appendix A: Groq API Reference

### Get API Key

1. Visit https://console.groq.com/
2. Sign up / Log in
3. Navigate to API Keys
4. Create new key
5. Copy key (starts with `gsk_`)

### API Documentation

- Official Docs: https://console.groq.com/docs/quickstart
- Models: https://console.groq.com/docs/models
- Rate Limits: https://console.groq.com/docs/rate-limits

### Sample cURL

```bash
curl -X POST "https://api.groq.com/openai/v1/chat/completions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [
      {"role": "system", "content": "Analyze sentiment. Reply YES or NO."},
      {"role": "user", "content": "I would love to schedule a demo!"}
    ],
    "temperature": 0
  }'
```

---

## Appendix B: Comparison with Existing Providers

| Feature | Groq | OpenAI | Gemini | Ollama | HuggingFace |
|---------|------|--------|--------|--------|-------------|
| Free Tier | Yes (14.4k/day) | No | Yes (limited) | Yes (local) | Yes (limited) |
| Speed | Fastest | Fast | Fast | Varies | Slow |
| Quality | High | Highest | High | Varies | Medium |
| Privacy | Cloud | Cloud | Cloud | Local | Cloud |
| Setup | Easy | Easy | Easy | Complex | Easy |
| Cost (Paid) | $0.05/1M tokens | $0.50/1M tokens | $0.075/1M tokens | Free | $0.01/1M tokens |

---

## Conclusion

Integrating Groq as a sentiment analysis provider offers significant advantages:

1. **Zero cost** - Free tier is generous enough for most users
2. **Blazing fast** - Sub-second response times
3. **High quality** - LLaMA models provide excellent classification
4. **Easy integration** - OpenAI-compatible API structure

This plan provides a clear roadmap for implementation while maintaining backward compatibility with existing providers and ensuring robust error handling.

---

*Document Version: 1.0*
*Created: December 2024*
*Author: Claude Code Assistant*
