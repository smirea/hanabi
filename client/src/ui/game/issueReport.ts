import type { HanabiState } from '../../game';

export const GITHUB_REPOSITORY_URL = 'https://github.com/smirea/hanabi';
const GITHUB_NEW_ISSUE_URL = `${GITHUB_REPOSITORY_URL}/issues/new`;

type IssueReportMode = 'local-debug' | 'online';

export interface GameIssueReportInput {
	state: HanabiState;
	roomId: string;
	mode: IssueReportMode;
	versionText: string | null;
	currentUrl: string;
	userAgent: string;
	createdAt?: string;
}

export interface GameIssueReport {
	issueUrl: string;
	stateFilename: string;
	screenshotFilename: string;
	stateJson: string;
}

function filenameTimestamp(createdAt: string): string {
	return createdAt.replace(/[:.]/g, '-');
}

function modeLabel(mode: IssueReportMode): string {
	return mode === 'local-debug' ? 'Local Debug' : 'Online';
}

export function buildGameIssueReport(input: GameIssueReportInput): GameIssueReport {
	const createdAt = input.createdAt ?? new Date().toISOString();
	const timestamp = filenameTimestamp(createdAt);
	const stateFilename = `hanabi-report-${timestamp}.json`;
	const screenshotFilename = `hanabi-report-${timestamp}.png`;
	const reportPayload = {
		type: 'hanabi-issue-report',
		version: 1,
		metadata: {
			createdAt,
			roomId: input.roomId,
			mode: input.mode,
			appVersion: input.versionText,
			url: input.currentUrl,
			userAgent: input.userAgent,
		},
		state: input.state,
	};
	const stateJson = JSON.stringify(reportPayload, null, 2);
	const body = [
		'## What happened',
		'',
		'<!-- Describe the issue here. -->',
		'',
		'## Repro base',
		'',
		`- State export: \`${stateFilename}\``,
		`- Screenshot: \`${screenshotFilename}\` (downloaded when browser capture works)`,
		'- Drag the downloaded files onto this issue before submitting.',
		'- Load the state from the burger menu with `Debug: Load State`, or run `DEBUG.loadState(report.state)` in the console.',
		'',
		'## Context',
		'',
		`- Room: ${input.roomId}`,
		`- Mode: ${modeLabel(input.mode)}`,
		`- App: ${input.versionText ?? 'unknown'}`,
		`- URL: ${input.currentUrl || 'unknown'}`,
		`- Created: ${createdAt}`,
		`- Browser: ${input.userAgent || 'unknown'}`,
	].join('\n');
	const issueParams = new URLSearchParams({
		title: `Issue in room ${input.roomId}`,
		body,
	});

	return {
		issueUrl: `${GITHUB_NEW_ISSUE_URL}?${issueParams.toString()}`,
		stateFilename,
		screenshotFilename,
		stateJson,
	};
}

export function downloadBlob(blob: Blob, filename: string): boolean {
	if (
		typeof document === 'undefined' ||
		typeof URL === 'undefined' ||
		typeof URL.createObjectURL !== 'function'
	) {
		return false;
	}

	const objectUrl = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = objectUrl;
	link.download = filename;
	link.rel = 'noopener';
	document.body.appendChild(link);
	link.click();
	link.remove();

	const revoke = () => URL.revokeObjectURL(objectUrl);
	if (typeof window !== 'undefined') {
		window.setTimeout(revoke, 30_000);
	} else {
		revoke();
	}

	return true;
}

export function downloadIssueReportState(report: GameIssueReport): boolean {
	return downloadBlob(
		new Blob([report.stateJson], { type: 'application/json;charset=utf-8' }),
		report.stateFilename,
	);
}

export function openIssueDraft(issueUrl: string): void {
	if (typeof window === 'undefined') {
		return;
	}

	const opened = window.open(issueUrl, '_blank', 'noopener,noreferrer');
	if (!opened) {
		window.location.assign(issueUrl);
	}
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
	if (typeof canvas.toBlob !== 'function') {
		return Promise.resolve(null);
	}

	return new Promise(resolve => {
		canvas.toBlob(blob => resolve(blob), 'image/png');
	});
}

export async function captureGameScreenshotBlob(element: HTMLElement): Promise<Blob | null> {
	if (typeof window === 'undefined' || typeof document === 'undefined' || !element.isConnected) {
		return null;
	}

	const { default: html2canvas } = await import('html2canvas');
	const backgroundColor = window.getComputedStyle(document.body).backgroundColor || null;
	const canvas = await html2canvas(element, {
		backgroundColor,
		logging: false,
		scale: Math.min(window.devicePixelRatio || 1, 2),
		useCORS: true,
	});

	return canvasToPngBlob(canvas);
}
