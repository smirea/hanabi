import { describe, expect, test } from 'bun:test';
import { HanabiGame } from '../../game';
import { buildGameIssueReport } from './issueReport';

describe('issue report helpers', () => {
	test('builds a downloadable state export and prefilled GitHub issue URL', () => {
		const state = new HanabiGame({
			playerNames: ['Ari', 'Blair'],
			shuffleSeed: 17,
		}).getSnapshot();
		const report = buildGameIssueReport({
			state,
			roomId: 'ABCD',
			mode: 'local-debug',
			versionText: 'version 05 31, 2026 @ 12:34',
			currentUrl: 'http://localhost:3000/?room=ABCD&debug_id=1',
			userAgent: 'Test Browser',
			createdAt: '2026-07-05T12:34:56.789Z',
		});

		expect(report.stateFilename).toBe('hanabi-report-2026-07-05T12-34-56-789Z.json');
		expect(report.screenshotFilename).toBe('hanabi-report-2026-07-05T12-34-56-789Z.png');

		const payload = JSON.parse(report.stateJson);
		expect(payload.metadata).toMatchObject({
			roomId: 'ABCD',
			mode: 'local-debug',
			appVersion: 'version 05 31, 2026 @ 12:34',
			url: 'http://localhost:3000/?room=ABCD&debug_id=1',
			userAgent: 'Test Browser',
		});
		expect(payload.state.players.map((player: { name: string }) => player.name)).toEqual([
			'Ari',
			'Blair',
		]);

		const issueUrl = new URL(report.issueUrl);
		expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(
			'https://github.com/smirea/hanabi/issues/new',
		);
		expect(issueUrl.searchParams.get('title')).toBe('Issue in room ABCD');
		const body = issueUrl.searchParams.get('body') ?? '';
		expect(body).toContain('State export: `hanabi-report-2026-07-05T12-34-56-789Z.json`');
		expect(body).toContain('Screenshot: `hanabi-report-2026-07-05T12-34-56-789Z.png`');
		expect(body).toContain('Mode: Local Debug');
	});
});
