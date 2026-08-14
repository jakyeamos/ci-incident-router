import { DEFAULT_MAX_FILES } from "./constants.mjs";

const API_BASE = "https://api.github.com";

export class GithubApiError extends Error {
  constructor(message, { status = null, url = null, body = null } = {}) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

function encodePath(path) {
  const [pathname, query] = path.split("?", 2);
  const encodedPath = pathname
    .split("/")
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join("/");
  return query === undefined ? encodedPath : `${encodedPath}?${query}`;
}

function apiUrl(path, apiBase = API_BASE) {
  return `${apiBase.replace(/\/$/, "")}/${encodePath(path.replace(/^\//, ""))}`;
}

export function createGithubClient({ token, fetchImpl = globalThis.fetch, apiBase = API_BASE } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }
  if (!token) {
    throw new Error("A GitHub token is required. Set GITHUB_TOKEN or GH_TOKEN, or authenticate gh.");
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "ci-incident-router/0.1",
  };

  async function request(path, { accept = headers.accept } = {}) {
    const url = apiUrl(path, apiBase);
    const response = await fetchImpl(url, {
      headers: { ...headers, accept },
      redirect: "follow",
    });
    const contentType = response.headers?.get?.("content-type") ?? "";
    const body = await response.text();
    if (!response.ok) {
      throw new GithubApiError(`GitHub API request failed (${response.status})`, {
        status: response.status,
        url,
        body: body.slice(0, 1_000),
      });
    }
    if (!body) return null;
    if (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new GithubApiError(`GitHub returned invalid JSON: ${error.message}`, { status: response.status, url });
      }
    }
    return body;
  }

  async function requestOptional(path) {
    try {
      return await request(path);
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 404) return null;
      throw error;
    }
  }

  return {
    async getWorkflowRun(repository, runId) {
      return request(`/repos/${repository}/actions/runs/${encodeURIComponent(String(runId))}`);
    },

    async getJobs(repository, runId) {
      const result = await request(`/repos/${repository}/actions/runs/${encodeURIComponent(String(runId))}/jobs?per_page=100`);
      return Array.isArray(result?.jobs) ? result.jobs : [];
    },

    async getRunArtifacts(repository, runId) {
      const result = await request(`/repos/${repository}/actions/runs/${encodeURIComponent(String(runId))}/artifacts?per_page=100`);
      return Array.isArray(result?.artifacts) ? result.artifacts : [];
    },

    async getArtifactsByName(repository, name) {
      const query = new URLSearchParams({ name, per_page: "100" });
      const result = await request(`/repos/${repository}/actions/artifacts?${query.toString()}`);
      return Array.isArray(result?.artifacts) ? result.artifacts : [];
    },

    async downloadArtifact(repository, artifactId) {
      const path = `/repos/${repository}/actions/artifacts/${encodeURIComponent(String(artifactId))}/zip`;
      const url = apiUrl(path, apiBase);
      const response = await fetchImpl(url, {
        // GitHub requires its JSON media type here and redirects to the ZIP.
        // application/zip is rejected with HTTP 415 before the redirect.
        headers: { ...headers, accept: headers.accept },
        redirect: "follow",
      });
      if (!response.ok) {
        const body = await response.text();
        throw new GithubApiError(`GitHub artifact download failed (${response.status})`, {
          status: response.status,
          url,
          body: body.slice(0, 1_000),
        });
      }
      return Buffer.from(await response.arrayBuffer());
    },

    async getJobLogs(repository, jobId) {
      const path = `/repos/${repository}/actions/jobs/${encodeURIComponent(String(jobId))}/logs`;
      const url = apiUrl(path, apiBase);
      const response = await fetchImpl(url, {
        // GitHub requires its JSON media type here and returns the log text.
        // text/plain is rejected with HTTP 415 before the log response.
        headers: { ...headers, accept: headers.accept },
        redirect: "follow",
      });
      if (response.status === 404 || response.status === 410) {
        return { status: "unavailable", note: `Logs are unavailable (HTTP ${response.status}).` };
      }
      if (!response.ok) {
        const body = await response.text();
        throw new GithubApiError(`GitHub log request failed (${response.status})`, {
          status: response.status,
          url,
          body: body.slice(0, 1_000),
        });
      }
      const contentType = response.headers?.get?.("content-type") ?? "";
      const body = await response.text();
      if (contentType.includes("zip") || body.startsWith("PK\u0003\u0004")) {
        return { status: "unavailable", note: "GitHub returned compressed logs that were not decoded." };
      }
      if (!body.trim()) {
        return { status: "unavailable", note: "GitHub returned an empty log." };
      }
      return { status: "ok", text: body };
    },

    async getPullRequest(repository, number) {
      return requestOptional(`/repos/${repository}/pulls/${encodeURIComponent(String(number))}`);
    },

    async getPullRequestFiles(repository, number) {
      const result = await request(`/repos/${repository}/pulls/${encodeURIComponent(String(number))}/files?per_page=${DEFAULT_MAX_FILES}`);
      return Array.isArray(result) ? result.slice(0, DEFAULT_MAX_FILES) : [];
    },
  };
}

export { API_BASE };
