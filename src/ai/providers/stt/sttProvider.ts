// Speech-to-text seam. Swappable so voicemail/call transcription can run on a mock (offline
// default), Deepgram (cloud), or a local Whisper path — behind one interface.
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface SttResult {
  text: string;
  segments?: TranscriptSegment[];
  engine: string;
}

export interface SttProvider {
  name: string;
  transcribe(audioPath: string): Promise<SttResult>;
}
