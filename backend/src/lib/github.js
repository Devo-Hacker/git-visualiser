
import { readFileSync } from "node:fs";
import { App, Octokit } from "octokit";
import { env } from "../config/env.js";

let app;

// Created on first use, so the private key file is only read when GitHub is actually needed.
export function getGithubApp() {
  if (!app) {
    const privateKey = env.GITHUB_PRIVATE_KEY
      ? env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n")
      : readFileSync(env.GITHUB_PRIVATE_KEY_PATH, "utf8");

    app = new App({
      appId: env.GITHUB_APP_ID,
      privateKey,
      oauth: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    });
  }
  return app;
}

// Trades the one-time code from the install redirect for a token that identifies the visitor.
export async function exchangeCodeForUserToken(code) {
  const { authentication } = await getGithubApp().oauth.createToken({ code });
  return authentication.token;
}

// The installations this visitor is allowed to use, according to GitHub itself.
export async function listUserInstallations(userToken) {
  const octokit = new Octokit({ auth: userToken });
  const installations = await octokit.paginate(
    octokit.rest.apps.listInstallationsForAuthenticatedUser,
    { per_page: 100 }
  );
  return installations.map((i) => ({
    id: i.id,
    account_login: i.account?.login ?? "unknown",
    account_type: i.account?.type === "Organization" ? "Organization" : "User",
  }));
}

// The repositories the user chose to share when installing the app.
export async function listInstallationRepos(installationId) {
  const octokit = await getGithubApp().getInstallationOctokit(installationId);
  const repos = await octokit.paginate(
    octokit.rest.apps.listReposAccessibleToInstallation,
    { per_page: 100 }
  );
  return repos.map((r) => ({
    github_repo_id: r.id,
    owner: r.owner.login,
    name: r.name,
    default_branch: r.default_branch,
    is_private: r.private,
  }));
}
