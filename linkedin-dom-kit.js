/**
 * LinkedIn DOM Kit — shared strategy lists, remote config, voyager cache, transcript validation.
 * Loaded before content.js. Exposes global LinkedInDomKit.
 */
(function (global) {
    'use strict';

    const DAY_MS = 86400000;
    const TELEMETRY_MAX = 40;
    const LOCAL_CONFIG_KEY = 'linkedin_dom_kit_cache';
    const LOCAL_FETCH_KEY = 'linkedin_dom_kit_last_fetch';
    const LOCAL_LOG_KEY = 'linkedin_dom_telemetry_log';
    const VOYAGER_MSG_TYPE = 'LINKEDIN_VOYAGER_MSG';
    const DEFAULT_REMOTE_CONFIG_URL =
        'https://raw.githubusercontent.com/abaddion/linkedin-extension-config/main/selector-config.json';

    const UI_NOISE_PATTERNS = [
        /^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        /^\d{1,2}:\d{2}\s?(am|pm)?$/i,
        /^(seen|delivered|sent|read)$/i,
        /^load more conversations$/i,
        /^maximize compose field$/i,
        /^open gif keyboard$/i,
        /^open emoji keyboard$/i,
        /^open send options$/i,
        /^open the options list/i,
        /^messaging$/i,
        /^focused$/i,
        /^type to search/i,
        /^search messages$/i,
        /^starred$/i,
        /^archived$/i
    ];

    const state = {
        extId: 'ext',
        merged: null,
        remoteVersion: 0,
        refreshTimer: null,
        voyagerListenerBound: false,
        voyagerThread: null,
        voyagerThreadKey: ''
    };

    const DEFAULT_STRATEGIES = {
        composer: [
            {
                kind: 'css',
                id: 'composer-stable',
                selectors: [
                    'div[role="textbox"][contenteditable="true"][aria-label*="Write a message" i]',
                    '[aria-label*="Write a message" i][contenteditable="true"]',
                    '[data-test-id="messaging-compose-body"]',
                    '[data-testid="messaging-compose-body"]',
                    '[placeholder*="message" i][contenteditable="true"]',
                    'div[contenteditable="true"][role="textbox"]',
                    '.msg-form__contenteditable',
                    '.msg-form [contenteditable="true"]',
                    '[class*="msg-form"] [contenteditable="true"][role="textbox"]',
                    'form.msg-form [contenteditable="true"]'
                ]
            },
            {
                kind: 'nested',
                id: 'composer-form',
                roots: [
                    '[data-test-id="messaging-compose-box"]',
                    '[data-testid="messaging-compose-box"]',
                    '[class*="msg-form"]',
                    '[class*="messaging-composer"]',
                    '.msg-overlay__panel',
                    'form.msg-form'
                ],
                child: '[contenteditable="true"][role="textbox"], div[contenteditable="true"]'
            },
            {
                kind: 'nested',
                id: 'composer-scope',
                roots: ['.msg-overlay', '[class*="msg-overlay"]', '#application-outlet', 'main'],
                child: '[contenteditable="true"][role="textbox"], div[contenteditable="true"]'
            }
        ],
        send: [
            {
                kind: 'css',
                id: 'send-stable',
                selectors: [
                    'button[aria-label*="Send" i]:not([disabled])',
                    'button[type="submit"][aria-label*="Send" i]:not([disabled])',
                    '[data-test-id="send-btn"]:not([disabled])',
                    '[data-testid="send-btn"]:not([disabled])',
                    '.msg-form__send-button:not([disabled])',
                    'form.msg-form button[type="submit"]:not([disabled])',
                    '[class*="msg-form"] button[type="submit"]:not([disabled])',
                    'button[aria-label*="Send" i]',
                    '[data-test-id="send-btn"]'
                ]
            }
        ],
        messageListRoot: [
            {
                kind: 'css',
                id: 'msg-list-stable',
                selectors: [
                    'main [role="log"]',
                    '[role="log"]',
                    '[data-test-id="message-list"]',
                    '[data-testid="message-list"]',
                    '[class*="message-list-content"]',
                    '.msg-s-message-list-content',
                    '.msg-s-message-list',
                    '[class*="msg-s-message-list"]',
                    '[class*="message-list-container"]',
                    'ul[class*="msg-s-message-list"]',
                    '[class*="msg-thread"] [class*="message-list"]',
                    'section[class*="message-list"]'
                ]
            }
        ],
        messageEvents: [
            {
                kind: 'css',
                id: 'msg-events-stable',
                selectors: [
                    '[data-event-urn]',
                    'li[role="listitem"]',
                    'li.msg-s-message-list__event',
                    '[class*="msg-s-message-list__event"]',
                    'li[class*="message-list__event"]',
                    'li[class*="msg-s-message-list"]',
                    '[class*="message-list__event"][class*="msg"]'
                ]
            }
        ],
        conversationListItem: [
            {
                kind: 'closest',
                id: 'conv-item-stable',
                selectors: [
                    '[data-view-name="message-conversation-list-item"]',
                    'a[href*="/messaging/thread/"]',
                    '.msg-conversation-card',
                    '.msg-conversation-listitem',
                    'li[class*="msg-conversation-listitem"]',
                    '[class*="msg-conversation-card"]',
                    '[class*="conversation-list-item"]',
                    '[class*="conversation-listitem"]',
                    'div[class*="conversation-card"]'
                ]
            }
        ],
        threadPane: [
            {
                kind: 'css',
                id: 'thread-pane',
                selectors: [
                    'main [role="log"]',
                    '[role="log"]',
                    '[data-test-id="message-list"]',
                    '.msg-s-message-list',
                    '[class*="msg-s-message-list"]',
                    '.msg-thread',
                    '[class*="msg-thread"]',
                    '[class*="message-list-container"]'
                ]
            }
        ],
        profileName: [
            {
                kind: 'css',
                id: 'profile-name',
                selectors: [
                    '[data-field="name"]',
                    'h1.text-heading-xlarge',
                    '.pv-text-details__left-panel h1',
                    'h1.inline.t-24',
                    '.text-heading-xlarge'
                ]
            }
        ],
        profileTitle: [
            {
                kind: 'css',
                id: 'profile-title',
                selectors: [
                    '[data-field="headline"]',
                    '.ph5.pb5 .text-body-medium',
                    '.pv-text-details__left-panel .text-body-medium',
                    '.top-card-layout__headline',
                    '.text-body-medium'
                ]
            }
        ],
        profileAbout: [
            {
                kind: 'css',
                id: 'profile-about',
                selectors: [
                    '[data-field="about"]',
                    '[data-section="summary"]',
                    '#about ~ .pv-shared-text-with-see-more p',
                    '.pv-about__summary-text .inline-show-more-text'
                ]
            }
        ],
        profileLocation: [
            {
                kind: 'css',
                id: 'profile-location',
                selectors: [
                    '[data-field="location"]',
                    '.pb2.pv-text-details__left-panel',
                    '.pv-top-card-section__location',
                    '.text-body-small.inline.t-black--light'
                ]
            }
        ],
        jobSearchName: [
            {
                kind: 'css',
                id: 'js-name',
                selectors: [
                    '[data-view-name="search-result-entity-name"]',
                    '.app-aware-link span[aria-hidden="true"]',
                    '.app-aware-link',
                    '.entity-result__title-text'
                ]
            }
        ],
        jobSearchSubtitle: [
            {
                kind: 'css',
                id: 'js-sub',
                selectors: [
                    '.entity-result__primary-subtitle',
                    '.entity-result__summary'
                ]
            }
        ],
        jobSearchCompany: [
            {
                kind: 'css',
                id: 'js-co',
                selectors: ['.entity-result__secondary-subtitle']
            }
        ],
        jobProfileName: [
            {
                kind: 'css',
                id: 'jp-name',
                selectors: ['.text-heading-xlarge', 'h1']
            }
        ]
    };

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function getMerged() {
        if (!state.merged) {
            state.merged = clone(DEFAULT_STRATEGIES);
        }
        return state.merged;
    }

    function emptyTranscript() {
        return { lines: [], transcriptText: '', lastTheirMessage: '', source: 'none', valid: false };
    }

    function buildTranscriptFromLines(lines, source) {
        const parts = [];
        let lastTheir = '';
        for (let j = 0; j < lines.length; j++) {
            const L = lines[j];
            const label = L.from === 'me' ? 'Me' : 'Them';
            parts.push(`${label}: ${L.text}`);
            if (L.from === 'them') lastTheir = L.text;
        }
        const result = {
            lines: lines,
            transcriptText: parts.join('\n'),
            lastTheirMessage: lastTheir,
            source: source || 'dom',
            valid: false
        };
        result.valid = validateTranscriptQuality(result);
        return result;
    }

    function queryFirst(selectors, root) {
        const r = root || document;
        for (const sel of selectors) {
            try {
                const el = r.querySelector(sel);
                if (el) return el;
            } catch (_) {}
        }
        return null;
    }

    function queryAll(selectors, root) {
        const r = root || document;
        for (const sel of selectors) {
            try {
                const list = r.querySelectorAll(sel);
                if (list && list.length) return list;
            } catch (_) {}
        }
        return null;
    }

    function runCssStep(step, root) {
        const selectors = step.selectors || [];
        return queryFirst(selectors, root || document);
    }

    function runNestedStep(step) {
        const roots = step.roots || [];
        const parent = queryFirst(roots, document);
        if (!parent || !step.child) return null;
        try {
            return parent.querySelector(step.child);
        } catch (_) {
            return null;
        }
    }

    function runStep(step, root) {
        if (!step || !step.kind) return null;
        if (step.kind === 'css') return runCssStep(step, root);
        if (step.kind === 'nested') return runNestedStep(step);
        return null;
    }

    function findWithFeature(feature, root) {
        const steps = getMerged()[feature];
        if (!steps || !steps.length) {
            return { el: null, lastIndex: -1, ids: [] };
        }
        const base = root || document;
        const ids = [];
        for (let i = 0; i < steps.length; i++) {
            const id = steps[i].id || String(i);
            ids.push(id);
            const el = runStep(steps[i], base);
            if (el) return { el, lastIndex: i, ids };
        }
        return { el: null, lastIndex: steps.length - 1, ids };
    }

    function roleCounts() {
        let textbox = 0;
        let main = 0;
        let ce = 0;
        try {
            textbox = document.querySelectorAll('[role="textbox"]').length;
            main = document.querySelectorAll('[role="main"]').length;
            ce = document.querySelectorAll('[contenteditable="true"]').length;
        } catch (_) {}
        return { textbox, main, contenteditable: ce };
    }

    function isVisibleEl(el) {
        if (!el) return false;
        try {
            const r = el.getBoundingClientRect();
            return !!(r.width || r.height || el.getClientRects().length);
        } catch (_) {
            return false;
        }
    }

    function looksLikeMessageText(text) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length < 2) return false;
        for (let i = 0; i < UI_NOISE_PATTERNS.length; i++) {
            if (UI_NOISE_PATTERNS[i].test(t)) return false;
        }
        return true;
    }

    function isUiNoiseLine(text) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        if (!t) return true;
        for (let i = 0; i < UI_NOISE_PATTERNS.length; i++) {
            if (UI_NOISE_PATTERNS[i].test(t)) return true;
        }
        if (/^(me|them):\s/i.test(t)) {
            const body = t.replace(/^(me|them):\s*/i, '').trim();
            return !looksLikeMessageText(body);
        }
        return !looksLikeMessageText(t);
    }

    /**
     * Returns false when transcript is empty or mostly LinkedIn UI chrome.
     * @param {{ lines?: Array, transcriptText?: string }} tt
     */
    function validateTranscriptQuality(tt) {
        if (!tt) return false;
        const lines = Array.isArray(tt.lines) && tt.lines.length
            ? tt.lines
            : parseLabeledTranscriptLines(tt.transcriptText || '');
        if (!lines.length) return false;

        let noise = 0;
        for (let i = 0; i < lines.length; i++) {
            if (isUiNoiseLine(lines[i].text)) noise += 1;
        }
        if (noise / lines.length > 0.35) return false;

        const hasThem = lines.some((l) => l.from === 'them' && looksLikeMessageText(l.text));
        const hasMe = lines.some((l) => l.from === 'me' && looksLikeMessageText(l.text));
        if (!hasThem && !hasMe) return false;

        const raw = String(tt.transcriptText || '');
        if (/load more conversations/i.test(raw) && lines.length < 4) return false;
        if (/open the options list in your conversation/i.test(raw) && !hasThem) return false;

        return true;
    }

    function isValidTranscript(tt) {
        return validateTranscriptQuality(tt);
    }

    function parseLabeledTranscriptLines(transcriptText) {
        const out = [];
        const rows = String(transcriptText || '').split('\n');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].trim();
            const m = row.match(/^(Me|Them):\s*(.+)$/i);
            if (!m) continue;
            out.push({
                from: m[1].toLowerCase() === 'me' ? 'me' : 'them',
                text: m[2].trim()
            });
        }
        return out;
    }

    function discoverMessageListRoot() {
        const composer = getComposer();
        if (composer) {
            let node = composer.parentElement;
            for (let depth = 0; depth < 18 && node; depth++) {
                const log = node.querySelector('[role="log"]');
                if (log && isVisibleEl(log)) {
                    const kids = log.querySelectorAll('li, [data-event-urn]');
                    if (kids.length) return log;
                }
                const lists = node.querySelectorAll('ul, ol, [class*="message-list"]');
                for (const list of lists) {
                    if (!isVisibleEl(list)) continue;
                    const kids = list.querySelectorAll('li, [data-event-urn]');
                    if (kids.length) return list;
                }
                node = node.parentElement;
            }
        }

        if (typeof location !== 'undefined' && /\/messaging/i.test(location.pathname || '')) {
            const logs = document.querySelectorAll('main [role="log"], [role="log"]');
            let best = null;
            let bestCount = 0;
            for (const log of logs) {
                if (!isVisibleEl(log)) continue;
                const kids = log.querySelectorAll('li, [data-event-urn]');
                if (kids.length > bestCount) {
                    best = log;
                    bestCount = kids.length;
                }
            }
            if (best) return best;
        }
        return null;
    }

    function stripConversationChrome(text) {
        const lines = String(text || '').split('\n');
        const sidebarEnd = 'Load more conversations';
        const headerPrefix = 'Open the options list in your conversation with';
        const composerStart = 'Maximize compose field';
        const composerCompanions = ['Open GIF Keyboard', 'Open Emoji Keyboard', 'Open send options'];
        const companionWindow = 8;

        let end = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() !== composerStart) continue;
            const hasCompanion = composerCompanions.some((label) =>
                lines.slice(i + 1, i + 1 + companionWindow).some((line) => line.trim() === label)
            );
            if (hasCompanion) {
                end = i;
                break;
            }
        }

        let start = 0;
        const sidebarIdx = lines.findIndex((line) => line.trim() === sidebarEnd);
        if (sidebarIdx >= 0) {
            const headerIdx = lines.findIndex(
                (line, idx) => idx > sidebarIdx && line.trim().startsWith(headerPrefix)
            );
            start = headerIdx >= 0 ? headerIdx + 1 : sidebarIdx + 1;
        } else {
            for (let i = end - 1; i >= 0; i--) {
                if (lines[i].trim().startsWith(headerPrefix)) {
                    start = i + 1;
                    break;
                }
            }
        }

        return lines.slice(start, end).join('\n').trim();
    }

    function extractMessageTextFromEvent(ev) {
        if (!ev) return '';
        const urnHost = ev.matches && ev.matches('[data-event-urn]') ? ev : ev.querySelector('[data-event-urn]');
        if (urnHost) {
            const p = urnHost.querySelector('p, span[dir="auto"], [dir="ltr"]');
            const text = (p ? p.textContent : urnHost.textContent || '').trim();
            if (looksLikeMessageText(text)) return text;
        }
        const bubble =
            (ev.querySelector &&
                (ev.querySelector('[class*="message-bubble"]') ||
                    ev.querySelector('[class*="msg-s-event-listitem__body"]') ||
                    ev.querySelector('[componentkey*="message"]'))) ||
            null;
        if (bubble) {
            const text = bubble.textContent.trim();
            if (looksLikeMessageText(text)) return text;
        }
        const text = (ev.textContent || '').trim();
        return looksLikeMessageText(text) ? text : '';
    }

    function isOutgoingByPosition(ev) {
        if (!ev || !isVisibleEl(ev)) return false;
        const bubble =
            ev.querySelector('[class*="message-bubble"], [class*="event-listitem__body"], [data-event-urn]') ||
            ev;
        const bRect = bubble.getBoundingClientRect();
        if (!bRect.width) return false;
        const pane =
            ev.closest('[role="log"], main, [class*="msg-thread"], [class*="message-list"]') || document.body;
        const pRect = pane.getBoundingClientRect();
        if (!pRect.width) return false;
        const center = pRect.left + pRect.width * 0.55;
        return bRect.left + bRect.width / 2 > center;
    }

    function telemetry(event) {
        if (typeof chrome === 'undefined' || !chrome.storage) return;
        chrome.storage.sync.get(['telemetry_opt_in'], (sync) => {
            if (!sync.telemetry_opt_in) return;
            const row = Object.assign(
                {
                    v: 1,
                    ext: state.extId,
                    t: Date.now(),
                    path: (typeof location !== 'undefined' && location.pathname) || ''
                },
                event
            );
            chrome.storage.local.get([LOCAL_LOG_KEY], (loc) => {
                const log = Array.isArray(loc[LOCAL_LOG_KEY]) ? loc[LOCAL_LOG_KEY] : [];
                log.push(row);
                while (log.length > TELEMETRY_MAX) log.shift();
                chrome.storage.local.set({ [LOCAL_LOG_KEY]: log });
            });
        });
    }

    function reportFailure(feature, detail) {
        telemetry(
            Object.assign(
                {
                    feature: feature,
                    ok: false,
                    counts: roleCounts()
                },
                detail
            )
        );
        scheduleRemoteRefresh();
    }

    function scheduleRemoteRefresh() {
        if (state.refreshTimer) return;
        state.refreshTimer = setTimeout(() => {
            state.refreshTimer = null;
            ensureConfigFresh(true).catch(() => {});
        }, 4000);
    }

    function mergeRemoteStrategies(remote) {
        if (!remote || typeof remote !== 'object') return;
        if (remote.version != null && Number(remote.version) < state.remoteVersion) return;
        const m = getMerged();
        const s = remote.strategies;
        if (!s || typeof s !== 'object') return;
        for (const key of Object.keys(s)) {
            if (Array.isArray(s[key]) && s[key].length) {
                m[key] = s[key];
            }
        }
        if (remote.version != null) state.remoteVersion = Number(remote.version);
    }

    async function sha256Hex(text) {
        const buf = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function applyRemotePayload(json) {
        if (!json || typeof json !== 'object') return;
        if (json.minExtensionVersion && typeof chrome !== 'undefined' && chrome.runtime) {
            const v = chrome.runtime.getManifest().version;
            if (compareSemver(v, json.minExtensionVersion) < 0) return;
        }
        const strategiesJson = JSON.stringify(json.strategies || {});
        if (json.checksum && json.strategies) {
            const hex = await sha256Hex(strategiesJson);
            if (hex !== json.checksum) return;
        }
        mergeRemoteStrategies(json);
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({
                [LOCAL_CONFIG_KEY]: json,
                [LOCAL_FETCH_KEY]: Date.now()
            });
        }
    }

    function compareSemver(a, b) {
        const pa = String(a).split('.').map(Number);
        const pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const da = pa[i] || 0;
            const db = pb[i] || 0;
            if (da > db) return 1;
            if (da < db) return -1;
        }
        return 0;
    }

    async function fetchRemote(url) {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
    }

    async function resolveRemoteConfigUrl() {
        const sync =
            typeof chrome !== 'undefined' && chrome.storage
                ? await chrome.storage.sync.get(['dom_remote_config_url'])
                : {};
        const custom = (sync.dom_remote_config_url || '').trim();
        return custom || DEFAULT_REMOTE_CONFIG_URL;
    }

    async function ensureConfigFresh(force) {
        const url = await resolveRemoteConfigUrl();
        if (!url) return;

        const loc =
            typeof chrome !== 'undefined' && chrome.storage
                ? await chrome.storage.local.get([LOCAL_FETCH_KEY, LOCAL_CONFIG_KEY])
                : {};
        const last = loc[LOCAL_FETCH_KEY] || 0;
        const age = Date.now() - last;
        if (!force && age < DAY_MS) return;

        try {
            const json = await fetchRemote(url);
            await applyRemotePayload(json);
        } catch (_) {
            /* keep merged defaults / cache */
        }
    }

    function getComposer() {
        const { el, lastIndex, ids } = findWithFeature('composer');
        if (el) return el;
        reportFailure('composer', {
            failedStrategyIndex: lastIndex,
            strategyIds: ids
        });
        return null;
    }

    function getSendButton() {
        const { el, lastIndex, ids } = findWithFeature('send');
        if (el) return el;
        reportFailure('send', {
            failedStrategyIndex: lastIndex,
            strategyIds: ids
        });
        return null;
    }

    function getMessageListRootEl() {
        const { el } = findWithFeature('messageListRoot');
        if (el) return el;
        return discoverMessageListRoot();
    }

    function getMessageEventsIn(root) {
        if (!root) return null;
        const steps = getMerged().messageEvents;
        if (!steps || !steps.length) return null;
        for (const step of steps) {
            const selectors = step.selectors || [];
            for (const sel of selectors) {
                try {
                    const list = root.querySelectorAll(sel);
                    if (list && list.length) return list;
                } catch (_) {}
            }
        }
        return null;
    }

    function resolveConversationClickTarget(target) {
        if (!target) return null;

        let node = target;
        for (let i = 0; i < 8 && node; i++) {
            const aria = (node.getAttribute && node.getAttribute('aria-label')) || '';
            if (
                aria &&
                /conversation with|message from|unread message|message to/i.test(aria) &&
                isVisibleEl(node)
            ) {
                return node;
            }
            node = node.parentElement;
        }

        const threadLink = target.closest('a[href*="/messaging/thread/"]');
        if (threadLink) {
            const row =
                threadLink.closest(
                    '[data-view-name="message-conversation-list-item"], .msg-conversation-listitem, .msg-conversation-card, [class*="conversation-listitem"], [class*="conversation-card"], li, [class*="conversation-list"]'
                ) || threadLink;
            return row;
        }

        const listSteps = getMerged().conversationListItem;
        if (listSteps && listSteps[0] && listSteps[0].kind === 'closest') {
            for (const sel of listSteps[0].selectors || []) {
                try {
                    const hit = target.closest(sel);
                    if (hit) return hit;
                } catch (_) {}
            }
        }

        const threadLinkLoose = target.closest('a[href*="/messaging/"]');
        if (threadLinkLoose) {
            return (
                threadLinkLoose.closest(
                    '[data-view-name="message-conversation-list-item"], .msg-conversation-listitem, .msg-conversation-card, li, [class*="conversation-list"]'
                ) || threadLinkLoose
            );
        }

        const paneSteps = getMerged().threadPane;
        if (paneSteps && paneSteps[0]) {
            for (const sel of paneSteps[0].selectors || []) {
                try {
                    if (target.closest(sel)) return document.body;
                } catch (_) {}
            }
        }
        if (getComposer() && /\/messaging/i.test(location.pathname || '')) {
            return document.body;
        }
        return null;
    }

    function getProfileSelectorsFor(field) {
        const key =
            field === 'name'
                ? 'profileName'
                : field === 'title'
                  ? 'profileTitle'
                  : field === 'about'
                    ? 'profileAbout'
                    : field === 'location'
                      ? 'profileLocation'
                      : null;
        if (!key) return [];
        const steps = getMerged()[key];
        if (!steps || !steps[0] || !steps[0].selectors) return [];
        return steps[0].selectors;
    }

    function findInContainer(container, feature) {
        if (!container) return null;
        const steps = getMerged()[feature];
        if (!steps || !steps[0]) return null;
        const sel = steps[0].selectors || [];
        return queryFirst(sel, container);
    }

    function findProfileField(field, root) {
        const selectors = getProfileSelectorsFor(field);
        if (!selectors.length) return null;
        return queryFirst(selectors, root || document);
    }

    function isOutgoingMessageEvent(ev) {
        if (!ev) return false;
        let node = ev;
        for (let depth = 0; depth < 5 && node; depth++) {
            const cls = typeof node.className === 'string' ? node.className : '';
            if (/\bmessage-list__event--sent\b/.test(cls) || /\bmessage-bubble--sent\b/.test(cls)) {
                return true;
            }
            const aria = (node.getAttribute && node.getAttribute('aria-label')) || '';
            if (/you sent|your message/i.test(aria)) return true;
            node = node.parentElement;
        }
        if (isOutgoingByPosition(ev)) return true;
        return false;
    }

    function normalizeMessageEventNode(ev) {
        if (!ev) return ev;
        return ev.closest('li, [role="listitem"]') || ev;
    }

    function collectMessageEventNodesLocal(root) {
        const list = getMessageEventsIn(root);
        if (list && list.length) {
            const seen = new Set();
            const filtered = [];
            for (const raw of list) {
                const ev = normalizeMessageEventNode(raw);
                if (seen.has(ev)) continue;
                if (!extractMessageTextFromEvent(ev)) continue;
                seen.add(ev);
                filtered.push(ev);
            }
            if (filtered.length) return filtered;
        }

        const urnNodes = root.querySelectorAll('[data-event-urn]');
        if (urnNodes.length) {
            const events = [];
            for (const urn of urnNodes) {
                const host = urn.closest('li, [role="listitem"], div') || urn;
                if (extractMessageTextFromEvent(host)) events.push(host);
            }
            if (events.length) return events;
        }

        const fb = root.querySelectorAll(
            'li[class*="msg-s"], li[class*="message-list__event"], li[class*="message-list"], li[role="listitem"]'
        );
        if (fb.length) {
            const filtered = Array.from(fb).filter((ev) => extractMessageTextFromEvent(ev));
            if (filtered.length) return filtered;
        }
        const any = root.querySelectorAll('li');
        return any.length ? Array.from(any).filter((ev) => extractMessageTextFromEvent(ev)) : [];
    }

    function getThreadTranscriptFromInnerText() {
        const empty = emptyTranscript();
        empty.source = 'innerText';
        const stripped = stripConversationChrome(document.body?.innerText || '');
        if (!stripped || stripped.length < 8) return empty;

        const rawLines = stripped
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => looksLikeMessageText(line));
        if (!rawLines.length) return empty;

        const lines = rawLines.map((text) => ({ from: 'them', text: text }));
        const result = buildTranscriptFromLines(lines, 'innerText');
        if (!result.valid) {
            reportFailure('transcript', { fallback: 'innerText', rejected: true });
        }
        return result;
    }

    function getVoyagerTranscript() {
        if (!state.voyagerThread || !state.voyagerThread.lines || !state.voyagerThread.lines.length) {
            return null;
        }
        const copy = buildTranscriptFromLines(state.voyagerThread.lines, 'voyager');
        return copy.valid ? copy : null;
    }

    /**
     * Ordered lines from the open thread. Voyager cache first, then DOM, then innerText.
     * @returns {{ lines: Array<{from: string, text: string}>, transcriptText: string, lastTheirMessage: string, source: string, valid: boolean }}
     */
    function getThreadTranscript(root) {
        const voyager = getVoyagerTranscript();
        if (voyager) return voyager;

        if (!root) {
            return getThreadTranscriptFromInnerText();
        }

        const events = collectMessageEventNodesLocal(root);
        const lines = [];
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            const outgoing = isOutgoingMessageEvent(ev);
            const text = extractMessageTextFromEvent(ev);
            if (!text) continue;
            lines.push({ from: outgoing ? 'me' : 'them', text: text });
        }

        if (lines.length) {
            return buildTranscriptFromLines(lines, 'dom');
        }

        return getThreadTranscriptFromInnerText();
    }

    function getConversationPartnerName() {
        const fromHeader = queryFirst(
            [
                '[data-test-id="conversation-header-name"]',
                '[data-testid="conversation-header-name"]',
                '[data-test-id="conversation-details-name"]',
                '.msg-conversation-header__title',
                '.msg-entity-lockup__entity-title',
                '[class*="msg-entity-lockup"] h2',
                '[class*="msg-conversation-header"] h2',
                '[class*="conversation-header"] h2',
                '[class*="thread-header"] h2',
                'h2[class*="entity-title"]'
            ],
            document
        );
        if (fromHeader) {
            const name = fromHeader.textContent.trim();
            if (name) return fromHeader;
        }

        const optionsBtn = queryFirst(
            ['button[aria-label*="Open the options list in your conversation with" i]'],
            document
        );
        if (optionsBtn) {
            const aria = optionsBtn.getAttribute('aria-label') || '';
            const match = aria.match(/conversation with\s+(.+?)(?:\.|$)/i);
            if (match && match[1]) {
                const span = document.createElement('span');
                span.textContent = match[1].trim();
                return span;
            }
        }
        return null;
    }

    function extractVoyagerBodyText(node) {
        if (!node || typeof node !== 'object') return '';
        const candidates = [
            node.body && node.body.text,
            node.messageBody && node.messageBody.text,
            node.attributedBody && node.attributedBody.text,
            node.text && typeof node.text === 'string' ? node.text : null,
            node.body && typeof node.body === 'string' ? node.body : null
        ];
        for (let i = 0; i < candidates.length; i++) {
            const t = candidates[i];
            if (typeof t === 'string' && t.trim()) return t.trim();
        }
        return '';
    }

    function voyagerNodeIsOutgoing(node) {
        if (!node || typeof node !== 'object') return false;
        if (node.fromSelf === true || node.isSentBySelf === true) return true;
        const actor = node.actor || node.sender || node.from || {};
        if (actor.participantType === 'SELF' || actor.self === true) return true;
        const type = String(node.$type || node.type || '');
        if (/SentMessage|Outgoing/i.test(type)) return true;
        return false;
    }

    function parseVoyagerPayload(json, url) {
        const collected = [];
        const seen = new Set();

        function pushLine(from, text, t) {
            const key = from + '|' + text;
            if (seen.has(key)) return;
            seen.add(key);
            collected.push({ from: from, text: text, t: t || 0 });
        }

        function walk(node, depth) {
            if (!node || depth > 14) return;
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) walk(node[i], depth + 1);
                return;
            }
            if (typeof node !== 'object') return;

            const text = extractVoyagerBodyText(node);
            if (text && looksLikeMessageText(text)) {
                const outgoing = voyagerNodeIsOutgoing(node);
                const t = Number(node.createdAt || node.deliveredAt || node.sentAt || 0);
                pushLine(outgoing ? 'me' : 'them', text, t);
            }

            const keys = ['included', 'data', 'elements', 'messages', 'events', 'conversationEvents'];
            for (let k = 0; k < keys.length; k++) {
                if (node[keys[k]]) walk(node[keys[k]], depth + 1);
            }
        }

        walk(json, 0);
        if (!collected.length) return;

        collected.sort((a, b) => (a.t || 0) - (b.t || 0));
        const lines = collected.map((c) => ({ from: c.from, text: c.text }));
        state.voyagerThread = { lines: lines, url: url || '' };
        state.voyagerThreadKey = String(Date.now());
        telemetry({ feature: 'voyager', ok: true, lineCount: lines.length });
    }

    function injectVoyagerPageScript() {
        if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.runtime) return;
        const root = document.documentElement;
        if (!root || root.dataset.linkedinDomKitVoyager) return;
        root.dataset.linkedinDomKitVoyager = '1';
        try {
            const el = document.createElement('script');
            el.src = chrome.runtime.getURL('voyager-intercept.js');
            el.onload = function () {
                el.remove();
            };
            (document.head || root).appendChild(el);
        } catch (_) {}
    }

    function initVoyagerListener() {
        if (state.voyagerListenerBound) return;
        state.voyagerListenerBound = true;
        injectVoyagerPageScript();
        window.addEventListener('message', (ev) => {
            if (ev.source !== window || !ev.data || ev.data.type !== VOYAGER_MSG_TYPE) return;
            try {
                parseVoyagerPayload(ev.data.payload, ev.data.url);
            } catch (_) {}
        });
    }

    function clearVoyagerThread() {
        state.voyagerThread = null;
        state.voyagerThreadKey = '';
    }

    async function init(opts) {
        state.extId = (opts && opts.extId) || 'ext';
        state.merged = clone(DEFAULT_STRATEGIES);
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const loc = await chrome.storage.local.get([LOCAL_CONFIG_KEY]);
            if (loc[LOCAL_CONFIG_KEY]) {
                if (loc[LOCAL_CONFIG_KEY].version != null) {
                    state.remoteVersion = Number(loc[LOCAL_CONFIG_KEY].version) || 0;
                }
                if (loc[LOCAL_CONFIG_KEY].strategies) {
                    mergeRemoteStrategies(loc[LOCAL_CONFIG_KEY]);
                }
            }
        }
        initVoyagerListener();
        ensureConfigFresh(false).catch(() => {});
    }

    global.LinkedInDomKit = {
        init,
        ensureConfigFresh,
        getMerged,
        queryFirst,
        queryAll,
        getComposer,
        getSendButton,
        getMessageListRootEl,
        getMessageEventsIn,
        getThreadTranscript,
        getConversationPartnerName,
        isOutgoingMessageEvent,
        resolveConversationClickTarget,
        getProfileSelectorsFor,
        findInContainer,
        findProfileField,
        findWithFeature,
        validateTranscriptQuality,
        isValidTranscript,
        clearVoyagerThread,
        initVoyagerListener,
        telemetry,
        reportFailure,
        roleCounts,
        DEFAULT_REMOTE_CONFIG_URL,
        DEFAULT_STRATEGIES,
        /* test hooks */
        _test: {
            looksLikeMessageText,
            validateTranscriptQuality,
            buildTranscriptFromLines,
            parseVoyagerPayload: parseVoyagerPayload,
            extractMessageTextFromEvent,
            collectMessageEventNodesLocal,
            stripConversationChrome
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
