# TransMUN Comms

A GitHub Pages-friendly Firebase web app for simulation room messaging and document dispatch.

## What this uses

- GitHub Pages serves the static files in `docs/`.
- Firebase Authentication signs users in anonymously.
- Cloud Firestore stores encrypted message/document records.
- Browser Web Crypto encrypts/decrypts room content with the room passphrase before Firestore sees it.

This is designed for simulation privacy, not high-stakes secrecy. Room names and sender labels are visible in Firestore metadata, but message/document bodies are encrypted.

## Firebase setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Web app in Project settings.
3. Copy the Firebase config into `docs/firebase-config.js`.
4. Enable Authentication, then enable the Anonymous sign-in provider.
5. Create a Cloud Firestore database.
6. Open Firestore Rules and paste the contents of `firestore.rules`, then publish.

## Local test

```sh
npm run dev
```

Open `http://127.0.0.1:3000`.

## GitHub Pages setup

1. Push this folder to a GitHub repository.
2. In the repository, go to Settings -> Pages.
3. Set the source to `Deploy from a branch`.
4. Choose the branch you pushed to, and set the folder to `/docs`.
5. Save.

GitHub will publish a URL like:

```text
https://your-username.github.io/your-repo-name/
```

## How to run the simulation

- Give each room a room code, such as `committee-a`.
- Give that room one passphrase. Use at least 8 characters; longer is better.
- Everyone in the same room can read the same encrypted room messages.
- Use different room codes/passphrases for private channels.
- Enable "Chair/document dispatch mode" only for chair/admin users who should post documents.

## Limits to understand

- This app does not stop someone from sharing a room code/passphrase.
- Firebase rules require sign-in and basic data validation, but they do not know the room passphrase.
- Anonymous Firebase users are still public internet users. Keep the rules published from `firestore.rules`.
- Do not use this for passwords, payment data, legal evidence, or anything genuinely sensitive.
