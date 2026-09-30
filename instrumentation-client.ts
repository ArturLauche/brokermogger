import { setNonce } from "get-nonce";

// Radix scroll locking creates style elements after hydration. Bind those to
// the current document's nonce, not a later RSC navigation's response nonce.
// Next executes client instrumentation before the application hydrates.
const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
if (nonce) setNonce(nonce);
