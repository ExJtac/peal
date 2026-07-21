// Minimal typed shapes for the ARI events + REST resources we use. ARI sends far more; we
// type only what the control plane reads.

export interface AriChannel {
  id: string;
  name: string;
  state: string;
  caller?: { number?: string; name?: string };
  connected?: { number?: string; name?: string };
  dialplan?: { context: string; exten: string; priority: number };
  creationtime?: string;
}

export interface AriBridge {
  id: string;
  bridge_type?: string;
  channels: string[];
}

export interface AriEvent {
  type: string;
  application?: string;
  timestamp?: string;
  args?: string[];
  channel?: AriChannel;
  bridge?: AriBridge;
  digit?: string;
  cause?: number;
  cause_txt?: string;
  playback?: { id: string; state: string };
  [k: string]: unknown;
}

export interface AsteriskInfo {
  system?: { version?: string };
  status?: { startup_time?: string };
}
