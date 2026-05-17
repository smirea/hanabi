export interface AppSearch {
	room?: string;
	debug_id?: string;
}

export function withPersistentSearch(room?: string): AppSearch {
	const debugId =
		typeof window === 'undefined'
			? undefined
			: new URLSearchParams(window.location.search).get('debug_id')?.trim() || undefined;

	const search: AppSearch = {};
	if (room !== undefined) search.room = room;
	if (debugId !== undefined) search.debug_id = debugId;
	return search;
}
