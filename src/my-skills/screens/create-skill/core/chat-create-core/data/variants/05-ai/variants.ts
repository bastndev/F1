import type { SkillVariantOption } from '../types';

export const aiVariants: SkillVariantOption[] = [
	{ id: 'rag-workflow', label: 'RAG Workflow', categoryId: 'ai', aliases: ['rag', 'retrieval', 'knowledge'], searchTerms: ['rag'], facets: ['retrieval'], weight: 94 },
	{ id: 'agent-workflow', label: 'Agent Workflow', categoryId: 'ai', aliases: ['agent', 'agents', 'tool calling'], searchTerms: ['agents'], facets: ['workflow'], weight: 90 },
	{ id: 'openai-integration', label: 'OpenAI', categoryId: 'ai', aliases: ['openai', 'gpt', 'chatgpt'], searchTerms: ['openai'], facets: ['llm'], relatedTechnologyIds: ['openai'], weight: 88 },
	{ id: 'prompt-engineering', label: 'Prompting', categoryId: 'ai', aliases: ['prompt', 'prompts', 'prompting'], searchTerms: ['prompt engineering'], facets: ['prompting'], weight: 82 },
	{ id: 'vector-search', label: 'Vector Search', categoryId: 'ai', aliases: ['vector', 'embedding', 'embeddings'], searchTerms: ['vector database'], facets: ['retrieval'], weight: 78 },
	{ id: 'ai-evals', label: 'AI Evals', categoryId: 'ai', aliases: ['eval', 'evals', 'evaluation'], searchTerms: ['ai evals'], facets: ['quality'], weight: 70 },
];

