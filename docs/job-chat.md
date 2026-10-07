# Contextual Job Chat

Chats belong to a job and to its client and accepted worker. Sending an offer no
longer creates a conversation. Acceptance creates it inside the same transaction;
the backfill migration creates missing conversations for previously accepted jobs.
Old conversations belonging to unaccepted offers remain stored but inaccessible.

`assigned` and `in_progress` jobs accept text and photos. `completed` and
`cancelled` jobs expose history only. Message insertion holds a row lock on the
job so completion cannot race an in-flight send. The HTTP and socket boundaries
both enforce accepted-offer membership. Deleting a job conversation is disabled.

## Photos

`POST /api/mobile/messages/:threadId/photo` takes `imageBase64` (JPEG, PNG or
WebP, maximum 6 MB) and an optional `caption`. The authenticated principal is the
sender. The server validates the caption, rejects animated images and QR codes,
checks visible text with local Spanish Tesseract OCR, strips metadata, and uploads
only the reviewed photo through the existing Cloudinary storage service. Photo
payloads are excluded from API logs. No new AI API key is required; trained OCR
data ships as an npm dependency. OCR is approximate: distorted, tiny or deliberately
obfuscated contact details can evade recognition. Text checks also cannot guarantee
detection of every creative evasion, such as contact details split across messages.

Arbitrary media URLs, audio and file uploads cannot bypass checks through the text
endpoint. A failed photo review sends nothing; a job closed during review refuses
the message and attempts to remove its unused upload.

## Rollout

1. Install backend dependencies with `npm ci` and run `npm run build`. This
   performs a non-incremental build and checks dependency injection in the
   compiled MobileModule without contacting production services. Do not commit
   `dist`; Railway must build it from the same source revision it deploys.
2. Apply migration `1791333000000-BackfillAcceptedJobChats` using the existing
   production migration command, then deploy the backend.
3. Release the updated Flutter app. It expects `context` on thread reads and
   `chatEnabled` on thread lists; it fails closed against the older API.

Existing text and photo messages remain readable. Older audio/file messages are
kept as text in the history; the new composer only supports text and job photos.
No production deployment or production database migration was performed locally.

## Verification

Backend: `npm test -- --runInBand` and `npx tsc --noEmit --incremental false`.
Flutter: `flutter test test/features/messages`.
Offline visual review: `flutter run -t tool/job_chat_preview.dart` in app-chamba.
The preview uses fixtures, has no authentication token and does not contact the
production backend. Its three tabs show the inbox, writable chat and closed chat.

OCR implementation follows [Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
Photo decoding and bounded resizing use [sharp](https://sharp.pixelplumbing.com/api-constructor/).
