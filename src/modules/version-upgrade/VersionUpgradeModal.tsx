import { Dialog as UnifiedDialog, DialogContent as UnifiedDialogContent } from '@/shared/ui/Dialog';
import { CloudDownload as UnifiedCloudDownload, X as UnifiedX, ExternalLink as UnifiedExternalLink } from '@/shared/icons';
import { Button } from '@/shared/ui/Button';
import { useCallback, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";

import { api } from "@/shared/api";
import type { ReleaseInfo,InstallMode } from "@/shared/types";
import { copyTextToClipboard,IS_PLATFORM } from "@/shared/utils";

type VersionUpgradeModalProps = {
    isOpen: boolean;
    onClose: () => void;
    releaseInfo: ReleaseInfo | null;
    currentVersion: string;
    latestVersion: string | null;
    installMode: InstallMode;
};

const RELOAD_COUNTDOWN_START = 120;

/** This module's only public export: rendered by the sidebar module's modal layer to show release notes and run the app upgrade. */
export function VersionUpgradeModal({
    isOpen,
    onClose,
    releaseInfo,
    currentVersion,
    latestVersion,
    installMode
}: VersionUpgradeModalProps) {
    const { t } = useTranslation('common');
    const upgradeCommand = installMode === 'npm'
        ? t('versionUpdate.npmUpgradeCommand')
        : IS_PLATFORM
            ? 'npm run update:platform'
            : 'git checkout main && git pull && npm install';
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateOutput, setUpdateOutput] = useState('');
    const [updateError, setUpdateError] = useState('');
    const [reloadCountdown, setReloadCountdown] = useState<number | null>(null);

    useEffect(() => {
        if (!IS_PLATFORM || reloadCountdown === null) {
            return;
        }

        if (reloadCountdown <= 0) {
            // Force a hard reload (bypass cache) so stale assets from the
            // previous version aren't served after the environment updates.
            const url = new URL(window.location.href);
            url.searchParams.set('_hardReload', Date.now().toString());
            window.location.replace(url.toString());
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setReloadCountdown((previousCountdown) => {
                if (previousCountdown === null) {
                    return null;
                }

                return Math.max(previousCountdown - 1, 0);
            });
        }, 1000);

        return () => window.clearTimeout(timeoutId);
    }, [reloadCountdown]);

    const handleUpdateNow = useCallback(async () => {
        setIsUpdating(true);
        setUpdateOutput(t('versionUpdate.startingUpdate') + '\n');
        setReloadCountdown(IS_PLATFORM ? RELOAD_COUNTDOWN_START : null);
        setUpdateError('');

        try {
            // Call the backend API to run the update command
            const response = await api.system.update();

            // The server (or a proxy in front of it) can answer with an HTML
            // page instead of JSON — e.g. while a hosted/Docker deployment
            // restarts mid-update — so never parse the body blindly.
            const rawBody = await response.text();
            let data: { output?: string; error?: string } | null = null;
            try {
                data = JSON.parse(rawBody);
            } catch {
                data = null;
            }

            if (!data) {
                if (IS_PLATFORM) {
                    // On platform the update restarts the server, which often
                    // cuts the response short. Treat it as in progress and let
                    // the reload countdown pick up the new version.
                    setUpdateOutput(prev => prev + '\n' + t('versionUpdate.updateStartedRestarting') + '\n');
                } else {
                    setReloadCountdown(null);
                    const message = t('versionUpdate.unexpectedResponse', { status: response.status });
                    setUpdateError(message);
                    setUpdateOutput(prev => prev + '\n❌ ' + t('versionUpdate.updateFailed') + ': ' + message + '\n');
                }
                return;
            }

            if (response.ok) {
                setUpdateOutput(prev => prev + (data.output || '') + '\n');
                setUpdateOutput(prev => prev + '\n✅ ' + t('versionUpdate.updateCompleted') + '\n');
                if (!IS_PLATFORM) {
                    setUpdateOutput(prev => prev + t('versionUpdate.restartServer') + '\n');
                }
            } else {
                setReloadCountdown(null);
                setUpdateError(data.error || t('versionUpdate.updateFailed'));
                setUpdateOutput(prev => prev + '\n❌ ' + t('versionUpdate.updateFailed') + ': ' + (data.error || t('versionUpdate.unknownError')) + '\n');
            }
        } catch (error: any) {
            if (IS_PLATFORM) {
                // Connection dropped mid-request — expected when the platform
                // update restarts the server. Keep the countdown running.
                setUpdateOutput(prev => prev + '\n' + t('versionUpdate.connectionInterrupted') + '\n');
            } else {
                setReloadCountdown(null);
                setUpdateError(error.message);
                setUpdateOutput(prev => prev + '\n❌ ' + t('versionUpdate.updateFailed') + ': ' + error.message + '\n');
            }
        } finally {
            setIsUpdating(false);
        }
    }, [t]);

    if (!isOpen) return null;

    return (
        <UnifiedDialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
            {/* Backdrop */}


            {/* Modal */}
            <UnifiedDialogContent wrapperClassName="z-50"  className=" mx-4 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl dark:border-border dark:bg-background">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/30">
                            <UnifiedCloudDownload className="h-5 w-5 text-primary dark:text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground dark:text-primary-foreground">{t('versionUpdate.title')}</h2>
                            <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                                {releaseInfo?.title || t('versionUpdate.newVersionReady')}
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="compact"
                        onClick={onClose}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted dark:hover:text-muted-foreground"
                    >
                        <UnifiedX className="h-5 w-5" />
                    </Button>
                </div>

                {/* Version Info */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-muted p-3 dark:bg-muted/50">
                        <span className="text-sm font-medium text-foreground dark:text-muted-foreground">{t('versionUpdate.currentVersion')}</span>
                        <span className="font-mono text-sm text-foreground dark:text-primary-foreground">{currentVersion}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-primary bg-primary/10 p-3 dark:border-primary dark:bg-primary/20">
                        <span className="text-sm font-medium text-primary dark:text-primary">{t('versionUpdate.latestVersion')}</span>
                        <span className="font-mono text-sm text-primary dark:text-primary">{latestVersion}</span>
                    </div>
                </div>

                {/* Changelog */}
                {releaseInfo?.body && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-foreground dark:text-primary-foreground">{t('versionUpdate.whatsNew')}</h3>
                            {releaseInfo?.htmlUrl && (
                                <a
                                    href={releaseInfo.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-primary hover:text-primary hover:underline dark:text-primary dark:hover:text-primary"
                                >
                                    {t('versionUpdate.viewFullRelease')}
                                    <UnifiedExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted p-4 dark:border-border dark:bg-muted/50">
                            <div className="prose prose-sm max-w-none text-sm text-foreground dark:prose-invert dark:text-muted-foreground">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={changelogComponents}>
                                    {cleanChangelog(releaseInfo.body)}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                )}

                {/* Update Output */}
                {(updateOutput || updateError) && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-foreground dark:text-primary-foreground">{t('versionUpdate.updateProgress')}</h3>
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-4 dark:bg-background">
                            <pre className="whitespace-pre-wrap font-mono text-xs text-success">{updateOutput}</pre>
                        </div>
                        {IS_PLATFORM && reloadCountdown !== null && (
                            <div className="rounded-md border border-primary bg-primary/10 px-3 py-2 text-xs text-primary dark:border-primary/40 dark:bg-primary/20 dark:text-primary">
                                {reloadCountdown === 0
                                    ? t('versionUpdate.refreshNow')
                                    : t('versionUpdate.refreshIn', { count: reloadCountdown })}
                            </div>
                        )}
                        {updateError && (
                            <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive dark:border-destructive/40 dark:bg-destructive/20 dark:text-destructive">
                                {updateError}
                            </div>
                        )}
                    </div>
                )}

                {/* Upgrade Instructions */}
                {!isUpdating && !updateOutput && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground dark:text-primary-foreground">{t('versionUpdate.manualUpgrade')}</h3>
                        <div className="rounded-lg border bg-muted p-3 dark:bg-background">
                            <code className="font-mono text-sm text-foreground dark:text-foreground">
                                {upgradeCommand}
                            </code>
                        </div>
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                            {t('versionUpdate.manualUpgradeHint')}
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Button variant="ghost" size="compact"
                        onClick={onClose}
                        className="flex-1 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
                    >
                        {updateOutput ? t('versionUpdate.buttons.close') : t('versionUpdate.buttons.later')}
                    </Button>
                    {!updateOutput && (
                        <>
                            <Button variant="ghost" size="compact"
                                onClick={() => copyTextToClipboard(upgradeCommand)}
                                className="flex-1 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
                            >
                                {t('versionUpdate.buttons.copyCommand')}
                            </Button>
                            <Button variant="ghost" size="compact"
                                onClick={handleUpdateNow}
                                disabled={isUpdating}
                                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:bg-primary"
                            >
                                {isUpdating ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        {t('versionUpdate.buttons.updating')}
                                    </>
                                ) : (
                                    t('versionUpdate.buttons.updateNow')
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </UnifiedDialogContent>
        </UnifiedDialog>
    );
};

const changelogComponents = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline dark:text-primary">
            {children}
        </a>
    ),
};

// Clean up changelog by removing GitHub-specific metadata
const cleanChangelog = (body: string) => {
    if (!body) return '';

    return body
        // Remove full commit hashes (40 character hex strings)
        .replace(/\b[0-9a-f]{40}\b/gi, '')
        // Remove short commit hashes (7-10 character hex strings at start of line or after dash/space)
        .replace(/(?:^|\s|-)([0-9a-f]{7,10})\b/gi, '')
        // Remove "Full Changelog" links
        .replace(/\*\*Full Changelog\*\*:.*$/gim, '')
        // Remove compare links (e.g., https://github.com/.../compare/v1.0.0...v1.0.1)
        .replace(/https?:\/\/github\.com\/[^\/]+\/[^\/]+\/compare\/[^\s)]+/gi, '')
        // Clean up multiple consecutive empty lines
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Trim whitespace
        .trim();
};
