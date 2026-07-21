export function voicemailSummaryPrompt(transcript: string): string {
  return (
    "A caller left this voicemail for a business. Give a one-sentence summary, extract any " +
    "concrete action items (callbacks, requests), and tag urgency (low/normal/high).\n\n" +
    `Voicemail transcript:\n${transcript}`
  );
}

export function callSummaryPrompt(transcript: string): string {
  return (
    "Summarize this business phone call in 1-2 sentences, list any action items, and assess " +
    "the caller's sentiment and urgency.\n\n" +
    `Call transcript:\n${transcript}`
  );
}
