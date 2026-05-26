---
title: "Viewer API Basics"
description: "Connect external controls to Viewer through the public client flow."
locale: "en"
slug: "workflows/viewer-api"
status: "draft"
audience: ["developer","streamer"]
workflow: "viewer-api"
media:
  - "viewer-api.browser-sample"
---
# Viewer API Basics

Use the Viewer API when a local tool needs to control or observe Viewer state.

## What This Is For

The Viewer API is for local pairing between Viewer and a client you trust. A client might be a browser sample, a local control panel, or a development tool. The API should be tested with small safe requests before you allow broad control.

## What You Need

- Viewer running locally.
- A client that uses the public Viewer API client flow.
- Permission to pair with the current Viewer session.
- A clear reason for each scope the client requests.

## Pairing Flow

1. Open Viewer and load a test model.
2. Start the client sample or local tool.
3. Confirm the endpoint is local and expected.
4. Start pairing.
5. Complete the challenge shown by Viewer or the client.
6. Review requested scopes before allowing access.
7. Send a read-only or status request first.
8. Try one small control request.
9. Close or revoke the session when testing is done.

## Scope Review

Before allowing a client, ask:

- Does it need to read state?
- Does it need to change parameters?
- Does it need to load files?
- Does it need to stay connected after the test?

Grant only what the test needs. If you are not sure, deny the request and use the Viewer manually.

## Safe Testing Pattern

Use this order:

1. Read status.
2. Read model information.
3. Send one reversible parameter change.
4. Reset to rest.
5. Disconnect.

Avoid sending large scripted control sequences until the simple flow works.

## Check Your Result

The client should show a paired or authenticated state, and Viewer should respond only to requests covered by the granted scopes.

## If Something Looks Wrong

- If pairing fails, restart Viewer and the client sample.
- If the endpoint looks unfamiliar, stop and check the client configuration.
- If a request is denied, review the granted scopes.
- If the model does not respond, test Viewer controls manually.
- Do not paste tokens, endpoint URLs with secrets, or raw protocol payloads into public reports.

## Next

[FAQ](../faq.md)
