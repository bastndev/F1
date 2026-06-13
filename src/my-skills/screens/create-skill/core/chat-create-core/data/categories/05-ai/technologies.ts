import type { TechnologyOption } from '../types';

export const aiTechnologies: TechnologyOption[] = [
	{ id: 'openai', label: 'OpenAI', aliases: ['openai', 'gpt', 'chatgpt'], searchTerms: ['openai'], facets: ['llm'], weight: 95 },
	{ id: 'langchain', label: 'LangChain', aliases: ['langchain'], searchTerms: ['langchain'], facets: ['agents'], weight: 86 },
	{ id: 'rag', label: 'RAG', aliases: ['rag', 'retrieval', 'retrieval augmented generation'], searchTerms: ['rag'], facets: ['retrieval'], weight: 84 },
	{ id: 'vector-db', label: 'Vector DB', aliases: ['vector db', 'vector database', 'embeddings'], searchTerms: ['vector database'], facets: ['retrieval'], weight: 80 },
	{ id: 'agents', label: 'Agents', aliases: ['agents', 'agentic', 'tool calling'], searchTerms: ['agents'], facets: ['workflow'], weight: 78 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['ai llm'], facets: ['llm'], weight: 1 },
];

