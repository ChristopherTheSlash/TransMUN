# TransMUN Comms

A GitHub Pages-friendly Firebase web app for simulation room messaging and document dispatch.

## What this uses

- GitHub Pages serves the static files in `docs/`.
- Firebase Authentication signs the browser in anonymously so Firestore can work.
- Cloud Firestore stores room messages and document links.

This is designed for a controlled simulation, not high-stakes secrecy. Country/password accounts are stored in the static app/Firestore for event convenience.

## Firebase setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a Web app in Project settings.
3. Copy the Firebase config into `docs/firebase-config.js`.
4. Enable Authentication, then enable the Anonymous sign-in provider.
5. Create a Cloud Firestore database.
6. Open Firestore Rules and paste the contents of `firestore.rules`, then publish.

## Accounts and roles

Default country/password accounts live in `docs/firebase-config.js`.

Current built-in account names:

```text
Chair
USA
Britain
France
Egypt
Israel
```

Create matching Firebase Authentication Email/Password users using the hidden emails in `docs/firebase-config.js`, then set the passwords privately in Firebase Console. Delegates still type only the country/account name on the site.

Admin routing is controlled by account role. Accounts with `role: "chair"` open the admin panel; accounts with `role: "delegate"` open the delegate workspace.

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

- Everyone signs into the same main event room.
- Delegates can send messages to one to three recipients.
- Delegate messages go to chair screening first.
- Chair/admin users can approve messages for delivery or return them with a note.
- Everyone can read document links.
- Add extra country/password accounts from the admin People panel or in `docs/firebase-config.js`.

## Limits to understand

- This app does not stop someone from sharing their account password.
- Country/password credentials are not strong security because this is a static site.
- Firebase rules require anonymous sign-in and basic data validation. Keep the rules published from `firestore.rules`.
- Do not use this for passwords, payment data, legal evidence, or anything genuinely sensitive.
