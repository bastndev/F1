export type FileMentionEntry = {
	name: string;
	path: string;
	displayPath?: string;
	isDirectory: boolean;
};

export type FileMentionRequest = (query: string) => Promise<FileMentionEntry[]>;
