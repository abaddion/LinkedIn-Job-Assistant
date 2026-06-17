# Privacy Policy for LinkedIn Job Assistant

Last updated: 17 June 2026

## Introduction

LinkedIn Job Assistant helps job seekers draft LinkedIn messages, connection requests, and InMail using AI. This policy explains how data is handled.

## Data collection and use

Our extension:

- Does **not** collect personal information on our servers
- Does **not** track user behavior for advertising
- Does **not** sell or share data with third parties

Optional **local diagnostics** (off by default): if enabled in Options, the extension saves URL path and selector metadata in Chrome local storage on your device only. No profile or message text is logged.

## API key

- You provide your own API key (OpenAI, Google Gemini, or Anthropic)
- The key is stored in Chrome sync/local storage on your device
- Requests go from your browser directly to the provider you chose
- We do not have access to your API key

## Data usage

The extension:

- Reads LinkedIn profile fields visible on the page to personalise drafts
- Uses job descriptions and context you enter
- Sends prompts to your chosen AI provider when you generate a message
- All generation is initiated by you in the browser

## Third-party services

The extension may contact:

- **OpenAI**, **Google Gemini**, or **Anthropic** APIs (your key, when you generate text)
- **Google Fonts** / Adobe Fonts (Options UI)
- **raw.githubusercontent.com** (remote selector config for reliability)

## Security

- API keys stored via Chrome’s storage APIs
- No backend servers operated by us for message content

## Changes

We may update this policy. Changes will be posted in this file in the [GitHub repository](https://github.com/abaddion/LinkedIn-Job-Assistant).

## Contact

Questions: **barbora@recberry.com**
