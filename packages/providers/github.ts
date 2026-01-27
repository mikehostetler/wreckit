import { Octokit } from "@octokit/rest";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

export interface GitHubProvider {
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestInfo | null>;
  listPullRequests(owner: string, repo: string, head?: string): Promise<PullRequestInfo[]>;
  getPRChecks(owner: string, repo: string, prNumber: number): Promise<ChecksInfo>;
  mergePullRequest(owner: string, repo: string, prNumber: number, method?: "squash" | "merge" | "rebase"): Promise<boolean>;
  findPreviewUrl(owner: string, repo: string, prNumber: number): Promise<string | null>;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  head: { ref: string; sha: string };
  base: { ref: string };
}

export interface ChecksInfo {
  state: "pending" | "success" | "failure" | "error";
  total: number;
  passed: number;
  failed: number;
  pending: number;
  checks: {
    name: string;
    status: string;
    conclusion: string | null;
    detailsUrl: string | null;
  }[];
}

export class OctokitGitHubProvider implements GitHubProvider {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestInfo | null> {
    try {
      const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: prNumber });
      return {
        number: data.number,
        title: data.title,
        url: data.html_url,
        state: data.state as "open" | "closed",
        merged: data.merged,
        mergeable: data.mergeable,
        head: { ref: data.head.ref, sha: data.head.sha },
        base: { ref: data.base.ref },
      };
    } catch (error) {
      log.error(`Failed to get PR: ${error}`);
      return null;
    }
  }

  async listPullRequests(owner: string, repo: string, head?: string): Promise<PullRequestInfo[]> {
    try {
      const { data } = await this.octokit.pulls.list({
        owner,
        repo,
        state: "open",
        head: head ? `${owner}:${head}` : undefined,
      });
      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.state as "open" | "closed",
        merged: pr.merged_at !== null,
        mergeable: null,
        head: { ref: pr.head.ref, sha: pr.head.sha },
        base: { ref: pr.base.ref },
      }));
    } catch (error) {
      log.error(`Failed to list PRs: ${error}`);
      return [];
    }
  }

  async getPRChecks(owner: string, repo: string, prNumber: number): Promise<ChecksInfo> {
    try {
      const pr = await this.getPullRequest(owner, repo, prNumber);
      if (!pr) {
        return { state: "error", total: 0, passed: 0, failed: 0, pending: 0, checks: [] };
      }

      const { data: checkRuns } = await this.octokit.checks.listForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });

      const checks = checkRuns.check_runs.map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        detailsUrl: run.details_url,
      }));

      const passed = checks.filter((c) => c.conclusion === "success").length;
      const failed = checks.filter((c) => c.conclusion === "failure").length;
      const pending = checks.filter((c) => c.status !== "completed").length;

      let state: ChecksInfo["state"] = "pending";
      if (pending === 0 && failed === 0 && passed > 0) state = "success";
      else if (failed > 0) state = "failure";

      return { state, total: checks.length, passed, failed, pending, checks };
    } catch (error) {
      log.error(`Failed to get PR checks: ${error}`);
      return { state: "error", total: 0, passed: 0, failed: 0, pending: 0, checks: [] };
    }
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    method: "squash" | "merge" | "rebase" = "squash"
  ): Promise<boolean> {
    try {
      await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: method,
      });
      return true;
    } catch (error) {
      log.error(`Failed to merge PR: ${error}`);
      return false;
    }
  }

  async findPreviewUrl(owner: string, repo: string, prNumber: number): Promise<string | null> {
    try {
      const pr = await this.getPullRequest(owner, repo, prNumber);
      if (!pr) return null;

      const { data: checkRuns } = await this.octokit.checks.listForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });

      for (const run of checkRuns.check_runs) {
        if (run.details_url) {
          if (run.details_url.includes("vercel.com") || run.name.toLowerCase().includes("vercel")) {
            return run.details_url;
          }
        }
      }

      const { data: statuses } = await this.octokit.repos.listCommitStatusesForRef({
        owner,
        repo,
        ref: pr.head.sha,
      });

      for (const status of statuses) {
        if (status.target_url) {
          if (
            status.target_url.includes("vercel.app") ||
            status.context.toLowerCase().includes("vercel") ||
            status.context.toLowerCase().includes("preview")
          ) {
            return status.target_url;
          }
        }
      }

      try {
        const { data: deployments } = await this.octokit.repos.listDeployments({
          owner,
          repo,
          sha: pr.head.sha,
        });

        for (const deployment of deployments) {
          const { data: depStatuses } = await this.octokit.repos.listDeploymentStatuses({
            owner,
            repo,
            deployment_id: deployment.id,
          });

          for (const depStatus of depStatuses) {
            if (depStatus.environment_url) {
              return depStatus.environment_url;
            }
          }
        }
      } catch {
      }

      return null;
    } catch (error) {
      log.error(`Failed to find preview URL: ${error}`);
      return null;
    }
  }
}

export function createGitHubProvider(token: string): GitHubProvider {
  return new OctokitGitHubProvider(token);
}
