/** Playback lifecycle reported by the extension host to the webview. */
export type VoiceState = 'preparing' | 'speaking' | 'idle' | 'error';

/** Chunk currently being prepared or spoken by the voice host. */
export type VoiceProgress = {
	chunkIndex: number;
	chunkCount: number;
};
