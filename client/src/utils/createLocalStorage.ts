import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type AnyObject = Record<string, any>;

type StorageLike = {
	getItem?: (key: string) => string | null;
	setItem?: (key: string, value: string) => void;
	removeItem?: (key: string) => void;
	key?: (index: number) => string | null;
	length?: number;
	[key: string]: unknown;
};

export type LocalStorageOptions<T extends AnyObject> = {
	namespace: string;
	getDefaults?: () => Partial<T>;
	store?: StorageLike;
};

function createMemoryStore(): StorageLike {
	const values = new Map<string, string>();

	return {
		get length() {
			return values.size;
		},
		key(index: number) {
			return [...values.keys()][index] ?? null;
		},
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		},
		removeItem(key: string) {
			values.delete(key);
		},
	};
}

export class LocalStorage<T extends AnyObject = AnyObject> {
	options: Required<LocalStorageOptions<T>>;
	public readonly prefix: string;
	private onChangeEvents = new Set<(diff: Partial<T>) => void>();
	private eventsEnabled = false;

	constructor({ namespace, getDefaults, store }: LocalStorageOptions<T>) {
		this.options = {
			namespace,
			getDefaults: getDefaults ?? (() => ({})),
			store: store ?? globalThis.localStorage ?? createMemoryStore(),
		};
		this.prefix = `${this.options.namespace}:`;
		this.set({
			...this.options.getDefaults(),
			...this.getAll({ defaults: false }),
		});
		this.eventsEnabled = true;
	}

	private getKeyName(key: keyof T) {
		return this.prefix + String(key);
	}

	private getRaw(keyName: string): string | undefined {
		const value = this.options.store.getItem?.(keyName) ?? this.options.store[keyName];
		return typeof value === 'string' ? value : undefined;
	}

	private getAllStoreKeys(): string[] {
		if (
			typeof this.options.store.key === 'function' &&
			typeof this.options.store.length === 'number'
		) {
			return Array.from({ length: this.options.store.length }, (_, index) =>
				this.options.store.key?.(index),
			).filter((key): key is string => key !== null && key !== undefined);
		}

		return Object.keys(this.options.store);
	}

	private getAllKeys(): (keyof T)[] {
		return this.getAllStoreKeys()
			.filter(key => key.startsWith(this.prefix))
			.map(key => key.slice(this.prefix.length) as keyof T);
	}

	private setKey(key: keyof T, value: T[keyof T]) {
		const keyName = this.getKeyName(key);
		const encoded = JSON.stringify(value);
		if (this.options.store.setItem) {
			this.options.store.setItem(keyName, encoded);
			return;
		}

		this.options.store[keyName] = encoded;
	}

	private deleteKey(key: keyof T) {
		this.deleteRawKey(this.getKeyName(key));
	}

	private deleteRawKey(keyName: string) {
		if (this.options.store.removeItem) {
			this.options.store.removeItem(keyName);
			return;
		}

		delete this.options.store[keyName];
	}

	getAll({ defaults = true } = {}): T {
		const result: Partial<T> = defaults ? this.options.getDefaults() : {};
		this.getAllKeys().forEach(key => (result[key] = this.get(key)));
		return result as T;
	}

	get<K extends keyof T>(key: K, defaultValue?: T[K]) {
		try {
			const value = this.getRaw(this.getKeyName(key));
			if (value !== undefined) return JSON.parse(value) as T[K];
		} catch {
			this.deleteKey(key);
		}

		return defaultValue !== undefined ? defaultValue : this.options.getDefaults()[key];
	}

	set(diff: Partial<T>) {
		for (const [key, value] of Object.entries(diff) as Array<[keyof T, T[keyof T] | undefined]>) {
			if (value !== undefined) {
				this.setKey(key, value);
			} else {
				this.deleteKey(key);
			}
		}

		this.triggerChange(diff);
	}

	delete(key: keyof T) {
		this.deleteKey(key);
		this.triggerChange({ [key]: undefined } as Partial<T>);
	}

	reset() {
		this.getAllKeys().forEach(key => this.deleteKey(key));
		this.set(this.options.getDefaults());
	}

	clearAll() {
		this.getAllStoreKeys().forEach(key => this.deleteRawKey(key));
		this.triggerChange(this.options.getDefaults());
	}

	onChange(callback: (diff: Partial<T>) => void) {
		this.onChangeEvents.add(callback);

		return () => void this.onChangeEvents.delete(callback);
	}

	private triggerChange(diff: Partial<T>) {
		if (!this.eventsEnabled) return;
		for (const callback of this.onChangeEvents) callback(diff);
	}
}

export default function createLocalStorage<Shape extends AnyObject>(
	options: LocalStorageOptions<Shape>,
) {
	const LS = new LocalStorage<Shape>(options);

	const useLocalStorage = <K extends keyof Shape>(key: K, defaultValue?: Shape[K]) => {
		const [value, setValue] = useState<Shape[K]>(() => LS.get(key, defaultValue) as Shape[K]);

		useEffect(() => {
			setValue(LS.get(key, defaultValue) as Shape[K]);
		}, [defaultValue, key]);

		useEffect(() => {
			return LS.onChange(diff => {
				if (key in diff) setValue(diff[key] as Shape[K]);
			});
		}, [key]);

		const setStoredValue: Dispatch<SetStateAction<Shape[K]>> = next => {
			setValue(current => {
				const resolved =
					typeof next === 'function' ? (next as (current: Shape[K]) => Shape[K])(current) : next;
				LS.set({ [key]: resolved } as unknown as Partial<Shape>);
				return resolved;
			});
		};

		return [value, setStoredValue] as const;
	};

	return { LS, useLocalStorage };
}
