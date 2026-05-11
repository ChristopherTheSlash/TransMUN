# TransMUN Comms

A GitHub Pages-friendly Firebase web app for simulation room messaging and document dispatch.

## What this uses

- GitHub Pages serves the static files in `docs/`.
- Firebase Authentication signs users in with email/password.
- Cloud Firestore stores room messages and document links.

This is designed for a controlled simulation, not high-stakes secrecy. Only Firebase-authenticated users should be able to read/write data when the Firestore rules are published.

## Firebase setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Web app in Project settings.
3. Copy the Firebase config into `docs/firebase-config.js`.
4. Enable Authentication, then enable the Email/Password sign-in provider.
5. Create a Cloud Firestore database.
6. Open Firestore Rules and paste the contents of `firestore.rules`, then publish.

## Accounts and roles

Create users manually in Firebase Console:

1. Open Authentication.
2. Open the Users tab.
3. Click Add user.
4. Enter each delegate or chair email/password.

Admin routing is controlled by the `adminEmails` list in `docs/firebase-config.js`. Any signed-in email in that list opens the admin panel; all other signed-in users open the delegate workspace.

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

- Create one Firebase email/password user for each participant.
- Everyone signs into the same main event room.
- Everyone can read the same room messages and document links.
- Put chair/admin emails in `adminEmails` so those users open the admin panel.

## Limits to understand

- This app does not stop someone from sharing their account password.
- Firebase rules require sign-in and basic data validation. Keep the rules published from `firestore.rules`.
- Do not use this for passwords, payment data, legal evidence, or anything genuinely sensitive.
