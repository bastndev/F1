export type FileMentionEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
};

export type FileMentionRequest = (query: string) => Promise<FileMentionEntry[]>;
