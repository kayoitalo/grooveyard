/** Session expiry is a sign-in state, not a provider or history failure. */
export async function privateFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    if (typeof window !== "undefined") window.location.assign("/login?expired=1");
    throw new Error("Sua sessão terminou. Entre de novo para continuar.");
  }
  return response;
}
