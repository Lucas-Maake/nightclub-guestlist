import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_APP_ID,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_EMULATOR_HOST,
	PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
	PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
	PUBLIC_FIREBASE_USE_EMULATORS
} from '$env/static/public';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: PUBLIC_FIREBASE_APP_ID
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;
let emulatorsConnected = false;

function ensureFirebaseApp(): FirebaseApp {
	if (app) {
		return app;
	}

	const missingKeys = Object.entries(firebaseConfig)
		.filter(([, value]) => !value)
		.map(([key]) => key);
	if (missingKeys.length > 0) {
		throw new Error(
			`Missing Firebase config: ${missingKeys.join(', ')}. Check .env.local PUBLIC_FIREBASE_* values.`
		);
	}

	app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
	auth = getAuth(app);
	db = getFirestore(app);
	functions = getFunctions(app);

	return app;
}

function connectEmulatorsIfNeeded(): void {
	if (typeof window === 'undefined') {
		return;
	}

	if (emulatorsConnected) {
		return;
	}

	const useEmulators = PUBLIC_FIREBASE_USE_EMULATORS === 'true';
	if (!useEmulators) {
		return;
	}

	const host = PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
	const authPort = Number(PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || '9099');
	const firestorePort = Number(PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT || '8080');

	connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
	connectFirestoreEmulator(db, host, firestorePort);
	connectFunctionsEmulator(functions, host, 5001);

	emulatorsConnected = true;
}

ensureFirebaseApp();
connectEmulatorsIfNeeded();

export { app as firebaseApp, auth, db, functions };
