type GistFile = {
  filename: string;
  content?: string;
  raw_url?: string;
  truncated?: boolean;
};

type GistResponse = {
  files?: Record<string, GistFile>;
};

type FetchGistOptions = {
  fileName?: string;
  signal?: AbortSignal;
};

const YAML_EXTENSIONS = ['.yaml', '.yml'];

function isYamlFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return YAML_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    if (/^gist\.github\.com\//i.test(raw) || /^gist\.githubusercontent\.com\//i.test(raw)) {
      try {
        return new URL(`https://${raw}`);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function extractGistId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const withoutQuery = trimmed.split('?')[0].split('#')[0];
  const parsedUrl = tryParseUrl(withoutQuery);
  if (parsedUrl) {
    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parsedUrl.hostname === 'gist.github.com') {
      return parts[parts.length - 1] ?? '';
    }
    if (parsedUrl.hostname === 'gist.githubusercontent.com') {
      return parts[1] ?? '';
    }
    return parts[parts.length - 1] ?? '';
  }

  const parts = withoutQuery.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function pickGistFile(
  files: Record<string, GistFile>,
  fileName?: string
): GistFile | null {
  const list = Object.values(files);
  if (!list.length) return null;

  if (fileName) {
    return files[fileName] ?? list.find((file) => file.filename === fileName) ?? null;
  }

  return list.find((file) => isYamlFile(file.filename)) ?? list[0];
}

export async function fetchGistContent(
  gistId: string,
  options: FetchGistOptions = {}
): Promise<string> {
  if (!gistId) throw new Error('Missing gist id.');

  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Gist request failed (${response.status}).`);
  }

  const data = (await response.json()) as GistResponse;
  const files = data.files ?? {};
  const file = pickGistFile(files, options.fileName);
  if (!file) throw new Error('Gist has no files.');

  if (file.truncated && file.raw_url) {
    const rawResponse = await fetch(file.raw_url, { signal: options.signal });
    if (!rawResponse.ok) {
      throw new Error(`Raw gist request failed (${rawResponse.status}).`);
    }
    return await rawResponse.text();
  }

  if (typeof file.content === 'string') return file.content;
  if (file.raw_url) {
    const rawResponse = await fetch(file.raw_url, { signal: options.signal });
    if (!rawResponse.ok) {
      throw new Error(`Raw gist request failed (${rawResponse.status}).`);
    }
    return await rawResponse.text();
  }

  throw new Error('Gist file has no content.');
}
