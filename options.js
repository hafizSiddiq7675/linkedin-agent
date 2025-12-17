document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('aiProvider');
    const apiKeyField = document.getElementById('apiKeyField');
    const apiKeyInput = document.getElementById('apiKey');
    const groqField = document.getElementById('groqField');
    const groqApiKeyInput = document.getElementById('groqApiKey');
    const groqModelSelect = document.getElementById('groqModel');
    const ollamaField = document.getElementById('ollamaField');
    const ollamaEndpointInput = document.getElementById('ollamaEndpoint');
    const ollamaModelInput = document.getElementById('ollamaModel');
    const promptInput = document.getElementById('customPrompt');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // Load settings
    chrome.storage.sync.get(['aiProvider', 'apiKey', 'groqApiKey', 'groqModel', 'ollamaEndpoint', 'ollamaModel', 'customPrompt'], (items) => {
        if (items.aiProvider) providerSelect.value = items.aiProvider;
        if (items.apiKey) apiKeyInput.value = items.apiKey;
        if (items.groqApiKey) groqApiKeyInput.value = items.groqApiKey;
        if (items.groqModel) groqModelSelect.value = items.groqModel;
        if (items.ollamaEndpoint) ollamaEndpointInput.value = items.ollamaEndpoint;
        if (items.ollamaModel) ollamaModelInput.value = items.ollamaModel;
        if (items.customPrompt) promptInput.value = items.customPrompt;
        toggleFields();
    });

    providerSelect.addEventListener('change', toggleFields);

    function toggleFields() {
        const val = providerSelect.value;
        apiKeyField.style.display = 'none';
        groqField.style.display = 'none';
        ollamaField.style.display = 'none';

        if (val === 'openai' || val === 'gemini' || val === 'huggingface') {
            apiKeyField.style.display = 'block';
        } else if (val === 'groq') {
            groqField.style.display = 'block';
        } else if (val === 'ollama') {
            ollamaField.style.display = 'block';
        }
    }

    saveBtn.addEventListener('click', () => {
        chrome.storage.sync.set({
            aiProvider: providerSelect.value,
            apiKey: apiKeyInput.value,
            groqApiKey: groqApiKeyInput.value,
            groqModel: groqModelSelect.value,
            ollamaEndpoint: ollamaEndpointInput.value,
            ollamaModel: ollamaModelInput.value,
            customPrompt: promptInput.value
        }, () => {
            statusDiv.style.display = 'block';
            setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
        });
    });
});
