(function (g) {
    'use strict';

    const MODELS = {
        openai: [
            { id: 'gpt-4o-mini', label: 'GPT-4o mini (recommended — fast, low cost)' },
            { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (older, still inexpensive)' }
        ],
        google: [
            { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (recommended)' },
            { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
        ],
        anthropic: [
            { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (recommended)' },
            { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
        ]
    };

    const DEFAULTS = {
        openai: 'gpt-4o-mini',
        google: 'gemini-2.0-flash',
        anthropic: 'claude-3-5-haiku-20241022'
    };

    function modelsForProvider(provider) {
        return MODELS[provider] || MODELS.openai;
    }

    function isAllowedModel(provider, modelId) {
        if (!modelId) return false;
        return modelsForProvider(provider).some((m) => m.id === modelId);
    }

    function defaultModel(provider) {
        return DEFAULTS[provider] || DEFAULTS.openai;
    }

    function normalizeProvider(p) {
        if (p === 'google' || p === 'anthropic' || p === 'openai') return p;
        return 'openai';
    }

    function validateApiKey(provider, key) {
        const k = (key || '').trim();
        if (!k) return { ok: false, message: 'Enter your API key.' };
        if (provider === 'openai') {
            if (!k.startsWith('sk-')) {
                return { ok: false, message: 'OpenAI secret keys usually start with sk-.' };
            }
            return { ok: true };
        }
        if (provider === 'google') {
            if (!k.startsWith('AIza')) {
                return { ok: false, message: 'Google AI Studio keys usually start with AIza.' };
            }
            return { ok: true };
        }
        if (provider === 'anthropic') {
            if (!k.startsWith('sk-ant-api')) {
                return { ok: false, message: 'Anthropic keys usually start with sk-ant-api…' };
            }
            return { ok: true };
        }
        return { ok: false, message: 'Unknown provider.' };
    }

    g.LLMConfig = {
        MODELS,
        DEFAULTS,
        modelsForProvider,
        isAllowedModel,
        defaultModel,
        normalizeProvider,
        validateApiKey,
        PROVIDER_ORDER: ['openai', 'google', 'anthropic'],
        PROVIDER_LABELS: {
            openai: 'OpenAI',
            google: 'Google Gemini',
            anthropic: 'Anthropic (Claude)'
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
