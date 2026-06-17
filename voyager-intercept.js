/**
 * Runs in page context (not content script). Patches fetch/XHR for Voyager messaging APIs.
 */
(function () {
    'use strict';

    if (window.__linkedinVoyagerIntercept) return;
    window.__linkedinVoyagerIntercept = true;

    const MSG_TYPE = 'LINKEDIN_VOYAGER_MSG';
    const VOYAGER_RE = /voyagerMessagingDash|messagingDash|voyager.*[Mm]essaging/i;

    function post(payload, url) {
        try {
            window.postMessage({ type: MSG_TYPE, payload: payload, url: url || '', t: Date.now() }, '*');
        } catch (_) {}
    }

    function maybeEmit(body, url) {
        if (!body || typeof body !== 'object') return;
        post(body, url);
    }

    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = async function (input, init) {
            const res = await origFetch.apply(this, arguments);
            try {
                const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
                if (VOYAGER_RE.test(url)) {
                    res.clone()
                        .json()
                        .then(function (j) {
                            maybeEmit(j, url);
                        })
                        .catch(function () {});
                }
            } catch (_) {}
            return res;
        };
    }

    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;

    XHR.open = function (method, url) {
        this.__linkedinVoyagerUrl = url;
        return origOpen.apply(this, arguments);
    };

    XHR.send = function () {
        this.addEventListener('load', function () {
            try {
                const url = this.__linkedinVoyagerUrl || '';
                if (!VOYAGER_RE.test(url) || !this.responseText) return;
                maybeEmit(JSON.parse(this.responseText), url);
            } catch (_) {}
        });
        return origSend.apply(this, arguments);
    };
})();
