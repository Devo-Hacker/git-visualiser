import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { signState, verifyState } from "../lib/state.js";
import {
  exchangeCodeForUserToken,
  listUserInstallations,
  listInstallationRepos,
} from "../lib/github.js";

export const githubRouter = Router();

const MAX_REPOS_PER_USER = 5;
const fail = (res, status, code, message) =>
  res.status(status).json({ error: { code, message } });

// The callback is a browser redirect, so errors go back to the frontend as a query parameter.
const backToApp = (res, params) =>
  res.redirect(`${env.FRONTEND_URL}/connect?${new URLSearchParams(params)}`);

// 1. Returns the GitHub install link, carrying a signed state that names the current user.
githubRouter.get("/install", requireAuth, (req, res) => {
  const state = signState({ uid: req.user.id }, env.STATE_SECRET);
  const url =
    `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new` +
    `?state=${encodeURIComponent(state)}`;
  res.json({ url });
});

// 2. GitHub sends the browser back here after the user installs the app.
githubRouter.get("/callback", async (req, res) => {
  const { code, installation_id, setup_action, state } = req.query;

  const payload = verifyState(state, env.STATE_SECRET);
  if (!payload) return backToApp(res, { error: "invalid_state" });

  // An organization owner has to approve the request first, so there is no installation yet.
  if (setup_action === "request") return backToApp(res, { status: "requested" });

  const installationId = Number(installation_id);
  if (typeof code !== "string" || !code || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return backToApp(res, { error: "missing_params" });
  }

  try {
    const userToken = await exchangeCodeForUserToken(code);

    // The installation id is just a number in a URL, so ask GitHub whether this visitor really owns it.
    const mine = await listUserInstallations(userToken);
    const match = mine.find((i) => i.id === installationId);
    if (!match) return backToApp(res, { error: "not_your_installation" });

    const { error } = await supabaseAdmin.from("github_installations").upsert(
      {
        user_id: payload.uid,
        installation_id: installationId,
        account_login: match.account_login,
        account_type: match.account_type,
      },
      { onConflict: "user_id,installation_id" }
    );
    if (error) throw error;

    backToApp(res, { status: "connected" });
  } catch (err) {
    req.log.error({ err }, "github callback failed");
    backToApp(res, { error: "exchange_failed" });
  }
});

// 3. Repositories the user shared, across all of their installations.
githubRouter.get("/repositories", requireAuth, async (req, res) => {
  const { data: links, error } = await supabaseAdmin
    .from("github_installations")
    .select("installation_id, account_login")
    .eq("user_id", req.user.id);
  if (error) throw error;

  const repositories = [];
  for (const link of links) {
    try {
      const repos = await listInstallationRepos(link.installation_id);
      for (const r of repos) {
        repositories.push({ ...r, installation_id: link.installation_id });
      }
    } catch (err) {
      // The app was uninstalled or access was removed: skip it instead of failing the whole list.
      if (err.status === 403 || err.status === 404) continue;
      throw err;
    }
  }
  res.json({ repositories });
});

const connectBody = z.object({
  installation_id: z.number().int().positive(),
  github_repo_id: z.number().int().positive(),
});

// 4. Connects one repository and queues its import job.
githubRouter.post("/repositories", requireAuth, async (req, res) => {
  const parsed = connectBody.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "BAD_REQUEST", "installation_id and github_repo_id must be positive integers");
  }
  const { installation_id, github_repo_id } = parsed.data;

  // The installation must be one this user has already proven they own.
  const { data: link, error: linkError } = await supabaseAdmin
    .from("github_installations")
    .select("installation_id")
    .eq("user_id", req.user.id)
    .eq("installation_id", installation_id)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return fail(res, 403, "FORBIDDEN", "Installation is not linked to your account");

  // The repository must be one the user actually shared with the app.
  let repos;
  try {
    repos = await listInstallationRepos(installation_id);
  } catch (err) {
    if (err.status === 403 || err.status === 404) repos = [];
    else throw err;
  }
  const repo = repos.find((r) => r.github_repo_id === github_repo_id);
  if (!repo) return fail(res, 404, "NOT_FOUND", "Repository was not shared with the app");

  const { count, error: countError } = await supabaseAdmin
    .from("repositories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", req.user.id);
  if (countError) throw countError;
  if (count >= MAX_REPOS_PER_USER) {
    return fail(res, 409, "LIMIT_REACHED", `You can connect up to ${MAX_REPOS_PER_USER} repositories`);
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("repositories")
    .insert({
      user_id: req.user.id,
      github_repo_id: repo.github_repo_id,
      owner: repo.owner,
      name: repo.name,
      default_branch: repo.default_branch,
      is_private: repo.is_private,
      installation_id,
    })
    .select("id, owner, name, status")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      return fail(res, 409, "ALREADY_CONNECTED", "Repository is already connected");
    }
    throw insertError;
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from("import_jobs")
    .insert({ repository_id: created.id })
    .select("id, status")
    .single();
  if (jobError) {
    // Do not leave a repository behind that has no job.
    await supabaseAdmin.from("repositories").delete().eq("id", created.id);
    throw jobError;
  }

  res.status(201).json({ repository: created, job });
});

