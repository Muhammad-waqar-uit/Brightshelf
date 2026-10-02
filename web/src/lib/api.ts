export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error("API_URL is not configured");
  }

  const response = await fetch(new URL(path, apiUrl), init);
  if (!response.ok) {
    throw new ApiError(response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("API response was not valid JSON");
  }
}