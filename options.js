/* global LLMConfig */

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('saveButton').addEventListener('click', saveOptions);
    document.getElementById('toggleVisibility').addEventListener('click', togglePasswordVisibility);
    document.getElementById('llmProvider').addEventListener('change', onProviderChanged);
    restoreOptions();
});

function onProviderChanged() {
    const provider = LLMConfig.normalizeProvider(document.getElementById('llmProvider').value);
    fillModelSelect(provider, null);
    updateKeyPlaceholderAndHint(provider);
}

function fillModelSelect(provider, savedModelId) {
    const select = document.getElementById('llmModel');
    const models = LLMConfig.modelsForProvider(provider);
    const preferred =
        savedModelId && LLMConfig.isAllowedModel(provider, savedModelId)
            ? savedModelId
            : LLMConfig.defaultModel(provider);

    select.innerHTML = '';
    for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        select.appendChild(opt);
    }
    select.value = preferred;
}

function updateKeyPlaceholderAndHint(provider) {
    const input = document.getElementById('apiKey');
    const hint = document.getElementById('keyHint');
    if (provider === 'openai') {
        input.placeholder = 'sk-…';
        hint.textContent = 'Use an API secret key from OpenAI.';
    } else if (provider === 'google') {
        input.placeholder = 'AIza…';
        hint.textContent = 'Create the key in Google AI Studio (link below).';
    } else {
        input.placeholder = 'sk-ant-api…';
        hint.textContent = 'Create the key in the Anthropic Console (link below).';
    }
}

function saveOptions() {
    const userName = document.getElementById('userName').value.trim();
    const provider = LLMConfig.normalizeProvider(document.getElementById('llmProvider').value);
    const modelId = document.getElementById('llmModel').value;
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!userName) {
        showStatus('Please enter a sign-off name.', 'error');
        return;
    }

    const keyCheck = LLMConfig.validateApiKey(provider, apiKey);
    if (!keyCheck.ok) {
        showStatus(keyCheck.message, 'error');
        return;
    }

    if (!LLMConfig.isAllowedModel(provider, modelId)) {
        showStatus('Pick a model from the list.', 'error');
        return;
    }

    const payload = {
        user_name: userName,
        llm_provider: provider,
        llm_model_id: modelId,
        llm_api_key: apiKey,
        telemetry_opt_in: document.getElementById('telemetryOptIn').checked,
        dom_remote_config_url: document.getElementById('domRemoteConfigUrl').value.trim()
    };
    if (provider === 'openai') {
        payload.openai_api_key = apiKey;
    }

    chrome.storage.sync.set(payload, () => {
        showStatus('Settings saved successfully.', 'success');
        const btn = document.getElementById('saveButton');
        const originalText = btn.textContent;
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

function restoreOptions() {
    chrome.storage.sync.get(
        {
            user_name: '',
            llm_provider: 'openai',
            llm_model_id: '',
            llm_api_key: '',
            openai_api_key: '',
            telemetry_opt_in: false,
            dom_remote_config_url: ''
        },
        (items) => {
            const provider = LLMConfig.normalizeProvider(items.llm_provider || 'openai');
            document.getElementById('userName').value = items.user_name || '';
            document.getElementById('llmProvider').value = provider;

            const savedKey = (items.llm_api_key || '').trim() || (items.openai_api_key || '').trim();
            document.getElementById('apiKey').value = savedKey;

            const savedModel = (items.llm_model_id || '').trim();
            fillModelSelect(provider, savedModel);
            updateKeyPlaceholderAndHint(provider);

            document.getElementById('telemetryOptIn').checked = Boolean(items.telemetry_opt_in);
            document.getElementById('domRemoteConfigUrl').value = items.dom_remote_config_url || '';
        }
    );
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;

    setTimeout(() => {
        statusDiv.className = 'status-message';
        statusDiv.textContent = '';
    }, 4000);
}

function togglePasswordVisibility() {
    const input = document.getElementById('apiKey');
    const btn = document.getElementById('toggleVisibility');

    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
    } else {
        input.type = 'password';
        btn.textContent = 'Show';
    }
}
