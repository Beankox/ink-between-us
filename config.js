// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD9Y0L7K-GjtPdiPF9k_coq4IeY-9Hrvec",
  authDomain: "in-between-us-d7586.firebaseapp.com",
  projectId: "in-between-us-d7586",
  storageBucket: "in-between-us-d7586.firebasestorage.app",
  messagingSenderId: "85543012727",
  appId: "1:85543012727:web:180a073b5ad03a3adf3972",
  measurementId: "G-PHKWYN2Z2Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 2) EmailJS config (emailjs.com → Account → General, and your Email Template)
const emailjsConfig = {
  publicKey: "PASTE_ME",
  serviceId: "PASTE_ME",
  templateId: "PASTE_ME"
};
