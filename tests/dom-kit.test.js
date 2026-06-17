/**
 * DOM kit regression tests — run: npm test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'messaging-thread-minimal.html');

function loadDomKit(dom) {
    const code = fs.readFileSync(path.join(ROOT, 'linkedin-dom-kit.js'), 'utf8');
    const win = dom.window;
    const ctx = {
        window: win,
        document: win.document,
        location: win.location,
        globalThis: win,
        chrome: {
            storage: {
                sync: { get: (_k, cb) => cb({}) },
                local: { get: (_k, cb) => cb({}), set: () => {} }
            },
            runtime: { getManifest: () => ({ version: '1.0.7' }), getURL: (p) => 'chrome-extension://test/' + p }
        },
        console: console
    };
    ctx.global = win;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return win.LinkedInDomKit;
}

test('extracts thread from data-event-urn fixture', async () => {
    const html = fs.readFileSync(FIXTURE, 'utf8');
    const dom = new JSDOM(html, { url: 'https://www.linkedin.com/messaging/thread/abc/' });
    const kit = loadDomKit(dom);

    const root = kit.getMessageListRootEl();
    assert.ok(root, 'message list root should be found');

    const tt = kit.getThreadTranscript(root);
    assert.equal(tt.source, 'dom');
    assert.equal(tt.lines.length, 3);
    assert.ok(kit.isValidTranscript(tt), 'fixture transcript should pass quality gate');
    assert.match(tt.transcriptText, /Them: Hi, I have a senior role/);
    assert.match(tt.transcriptText, /Me: Thanks for reaching out/);
    assert.equal(tt.lastTheirMessage, 'Happy to — it is a remote contract, 6 months, fintech.');
});

test('rejects innerText UI noise', () => {
    const dom = new JSDOM('<html><body>Load more conversations\nMessaging\nFocused\nType to search</body></html>', {
        url: 'https://www.linkedin.com/messaging/'
    });
    const kit = loadDomKit(dom);
    const tt = kit.getThreadTranscript(null);
    assert.equal(tt.source, 'innerText');
    assert.equal(kit.isValidTranscript(tt), false);
});

test('parses voyager JSON payload into transcript', async () => {
    const dom = new JSDOM('<html><body></body></html>', { url: 'https://www.linkedin.com/messaging/' });
    const kit = loadDomKit(dom);

    kit._test.parseVoyagerPayload(
        {
            included: [
                { body: { text: 'Hello from recruiter' }, fromSelf: false, createdAt: 1 },
                { body: { text: 'Thanks, interested' }, fromSelf: true, createdAt: 2 }
            ]
        },
        '/voyager/api/voyagerMessagingDashMessengerMessages'
    );

    const tt = kit.getThreadTranscript(null);
    assert.equal(tt.source, 'voyager');
    assert.ok(kit.isValidTranscript(tt));
    assert.equal(tt.lines.length, 2);
});

test('finds composer and send via stable aria selectors', () => {
    const html = fs.readFileSync(FIXTURE, 'utf8');
    const dom = new JSDOM(html, { url: 'https://www.linkedin.com/messaging/' });
    const kit = loadDomKit(dom);

    const composer = kit.getComposer();
    assert.ok(composer);
    assert.equal(composer.getAttribute('aria-label'), 'Write a message to Jane Doe');

    const send = kit.getSendButton();
    assert.ok(send);
    assert.match(send.getAttribute('aria-label'), /Send/i);
});
